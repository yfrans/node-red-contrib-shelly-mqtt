var events = require('events');

module.exports = function (RED) {
    function ShellyMQTTConfig(config) {
        RED.nodes.createNode(this, config);

        this.eventEmitter = new events.EventEmitter();

        this.mqttConf = RED.nodes.getNode(config.mqttBroker);
        this.deviceName = config.deviceName;
        this.deviceType = config.deviceType;
        this.lastState = {};

        if (this.mqttConf) {
            this.mqttConf.connect();
            this.mqttConf.client.on('connect', () => handleConnected(this));
            this.mqttConf.client.on('close', () => {
                this.eventEmitter.emit('disconnected');
            });
        }

        this.on('close', (removed, done) => {
            handleDisconnected(this);
            done();
        });

        this.onMqttMessage = handleMqttMessage.bind(this);

        this.register = function (event, cb) {
            this.events[event] = cb;
        };

        this.sendEvent = (event, payload) => {
            if (this.events[event]) {
                this.events[event].call(this, payload);
            }
        };

        this.sendDeviceAction = (msg) => {
            if (!this.mqttConf) {
                return false;
            }

            if (msg.action) {
                if (!['open', 'close', 'stop', 'on', 'off'].includes(msg.action)) {
                    this.error('got unknown command: ' + msg.action);
                    return false;
                }

                if (this.deviceType === '100') {
                    this.mqttConf.client.publish(`shellies/${this.deviceName}/roller/0/command`, msg.action);
                    if (msg.action !== 'stop' && msg.optime > 0) {
                        setTimeout(() => {
                            this.mqttConf.client.publish(`shellies/${this.deviceName}/roller/0/command`, 'stop');
                        }, msg.optime);
                    }
                } else {
                    this.mqttConf.client.publish(`shellies/${this.deviceName}/relay/${this.deviceType}/command`, msg.action);
                }
                return true;
            } else if (msg.position) {
                let pos = +msg.position;
                if (isNaN(pos) || pos < 0 || pos > 100) {
                    this.error('incorrect position value');
                    return false;
                }

                this.mqttConf.client.publish(`shellies/${this.deviceName}/roller/0/command/pos`, pos.toString());
                return true;
            }

            return false;
        };

        this.emitCachedState = () => {
            Object.keys(this.lastState).forEach(topic => {
                this.eventEmitter.emit(topic, this.lastState[topic]);
            });
        };
    }

    function handleDisconnected(node) {
        if (node.deviceType === '100') {
            node.mqttConf.unsubscribe(`shellies/${node.deviceName}/roller/0/pos`, node.onMqttMessage);
            node.mqttConf.unsubscribe(`shellies/${node.deviceName}/roller/0`, node.onMqttMessage);
        } else {
            node.mqttConf.unsubscribe(`shellies/${node.deviceName}/relay/${node.deviceType}`, node.onMqttMessage);
            node.mqttConf.unsubscribe(`shellies/${node.deviceName}/relay/${node.deviceType}/power`, node.onMqttMessage);
        }
    }

    function handleConnected(node) {
        node.eventEmitter.emit('connected');

        node.mqttConf.subscribe(`shellies/${node.deviceName}/announce`, { qos: 0 }, node.onMqttMessage);
        node.mqttConf.client.publish(`shellies/${node.deviceName}/command`, 'announce');    // Get device information (not used right now)
        node.mqttConf.client.publish(`shellies/${node.deviceName}/command`, 'update');   // This will force the device to report the current state

        if (node.deviceType === '100') {
            node.mqttConf.subscribe(`shellies/${node.deviceName}/roller/0`, { qos: 0 }, node.onMqttMessage);
            node.mqttConf.subscribe(`shellies/${node.deviceName}/roller/0/pos`, { qos: 0 }, node.onMqttMessage);
        } else {
            node.mqttConf.subscribe(`shellies/${node.deviceName}/relay/${node.deviceType}`, { qos: 0 }, node.onMqttMessage);
            node.mqttConf.subscribe(`shellies/${node.deviceName}/relay/${node.deviceType}/power`, { qos: 0 }, node.onMqttMessage);
        }
    }

    function endsWith(str, needle) {
        return str.indexOf(needle) === str.length - needle.length;
    }

    function handleMqttMessage(topic, message) {
        let emitTopic = null;
        let emitPayload = message.toString();
        if (endsWith(topic, '/roller/0/pos')) {
            emitTopic = 'roller-position';
        } else if (endsWith(topic, '/roller/0')) {
            emitTopic = 'roller-action';
        } else if (endsWith(topic, `/relay/${this.deviceType}`)) {
            emitTopic = 'relay-state';
        } else if (endsWith(topic, `/relay/${this.deviceType}/power`)) {
            emitTopic = 'relay-power';
        } else if (endsWith(topic, '/announce')) {
            emitTopic = 'announce';
        }

        if (emitTopic) {
            this.lastState[emitTopic] = emitPayload;
            this.eventEmitter.emit(emitTopic, emitPayload);
        }
    }

    RED.nodes.registerType('shelly-mqtt-config', ShellyMQTTConfig);
}
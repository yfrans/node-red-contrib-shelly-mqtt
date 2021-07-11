var events = require('events');

module.exports = function (RED) {
    function ShellyMQTTConfig(config) {
        RED.nodes.createNode(this, config);

        this.eventEmitter = new events.EventEmitter();

        this.mqttConf = RED.nodes.getNode(config.mqttBroker);
        this.deviceName = config.deviceName;
        this.deviceType = config.deviceType;

        if (this.mqttConf) {
            this.mqttConf.connect();
            this.mqttConf.client.on('connect', () => handleConnected(this));
            this.mqttConf.client.on('close', () => {
                this.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
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
        node.status({ fill: 'green', shape: 'dot', text: `connected to MQTT broker` });

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
        if (endsWith(topic, '/roller/0/pos')) {
            this.eventEmitter.emit('roller-position', message.toString());
        } else if (endsWith(topic, '/roller/0')) {
            this.eventEmitter.emit('roller-action', message.toString());
        } else if (endsWith(topic, `/relay/${this.deviceType}`)) {
            this.eventEmitter.emit('relay-state', message.toString());
        } else if (endsWith(topic, `/relay/${this.deviceType}/power`)) {
            this.eventEmitter.emit('relay-power', message.toString());
        }
    }

    RED.nodes.registerType('shelly-mqtt-config', ShellyMQTTConfig);
}
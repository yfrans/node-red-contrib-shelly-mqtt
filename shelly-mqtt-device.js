module.exports = function (RED) {
    function ShellyMQTTDevice(config) {
        RED.nodes.createNode(this, config);

        let stopEmitted = true; // Reset this to false only on input
        this.shellyConfig = RED.nodes.getNode(config.shellyDevice);
        this.lastState = {};

        this.sendNodeMessage = (payload) => {
            this.send({
                device: this.shellyConfig.deviceName,
                payload
            });
        };

        let emitStop = config.action !== 'stop' && config.emitStop;

        if (!emitStop) {
            this.shellyConfig.eventEmitter.on('roller-position', (position) => {
                this.sendNodeMessage({ position: +position });
                this.lastState.position = position;
                updateNodeStatus(this, this.lastState);
            });
            this.shellyConfig.eventEmitter.on('relay-state', (state) => {
                this.sendNodeMessage({ state });
                this.lastState.relay = state;
                updateNodeStatus(this, this.lastState);
            });
            this.shellyConfig.eventEmitter.on('relay-power', (power) => {
                this.sendNodeMessage({ power: +power });
                this.lastState.power = power;
                updateNodeStatus(this, this.lastState);
            });
            this.shellyConfig.eventEmitter.on('announce', (message) => {
                try { message = JSON.parse(message); }
                catch (ex) {
                    console.error('error while parsing announce message', ex);
                    message = null;
                }

                if (!message) {
                    return;
                }

                this.sendNodeMessage({
                    announce: Object.assign({
                        name: this.shellyConfig.name,
                        relay: this.shellyConfig.deviceType
                    }, message)
                });
            });
        }

        this.shellyConfig.eventEmitter.on('roller-action', (action) => {
            if (emitStop) {
                if (action === 'stop' && !stopEmitted) {
                    stopEmitted = true;
                    setTimeout(() => {
                        this.sendNodeMessage(null);
                    }, 500);
                }
            } else {
                this.sendNodeMessage({ action });
            }
            this.lastState.rollerAction = action;
            updateNodeStatus(this, this.lastState);
        });

        this.shellyConfig.eventEmitter.on('connected', () => updateNodeStatus(this, 'connected'));
        this.shellyConfig.eventEmitter.on('disconnected', () => updateNodeStatus(this, 'disconnected'));

        this.on('input', (msg) => {
            stopEmitted = false;

            if (this.shellyConfig.sendDeviceAction(msg)) {
                return;
            }

            if (config.action && config.action.length > 0) {
                if (config.action === 'position') {
                    msg.position = config.position;
                } else {
                    msg.action = config.action;
                    msg.optime = config.optime;
                }
                this.shellyConfig.sendDeviceAction(msg);
            }
        });
    }

    function updateNodeStatus(node, status) {
        if (status === 'connected') {
            node.status({ fill: 'green', shape: 'dot', text: `connected` });
        } else if (status === 'disconnected') {
            node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
        } else {
            let statusString = null;
            if (status.relay) {
                statusString = `relay: ${status.relay}`;
            } else if (status.rollerAction) {
                statusString = `roller: ${status.rollerAction}`;
                if (status.position) {
                    statusString += ` | ${status.position}%`;
                }
            }

            if (statusString && status.power) {
                statusString += ` | ${status.power}w`;
            }

            if (statusString) {
                node.status({ fill: 'green', shape: 'dot', text: statusString });
            }
        }
    }

    RED.nodes.registerType('shelly mqtt device', ShellyMQTTDevice);
}
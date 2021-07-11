module.exports = function (RED) {
    function ShellyMQTTDevice(config) {
        RED.nodes.createNode(this, config);

        this.shellyConfig = RED.nodes.getNode(config.shellyDevice);

        this.sendNodeMessage = (payload) => {
            this.send({
                device: config.deviceName,
                payload
            });
        };

        this.shellyConfig.eventEmitter.on('roller-position', (position) => {
            this.sendNodeMessage({ position: +position });
        });

        this.shellyConfig.eventEmitter.on('roller-action', (action) => {
            this.sendNodeMessage({ action });
        });

        this.shellyConfig.eventEmitter.on('relay-state', (state) => {
            this.sendNodeMessage({ state });
        });

        this.shellyConfig.eventEmitter.on('relay-power', (power) => {
            this.sendNodeMessage({ power: +power });
        });

        this.on('input', (msg) => {
            if (this.shellyConfig.sendDeviceAction(msg)) {
                return;
            }

            if (config.action && config.action.length > 0) {
                if (config.action === 'position') {
                    msg.position = config.position;
                } else {
                    msg.action = config.action;
                }
                this.shellyConfig.sendDeviceAction(msg);
            }
        });
    }

    RED.nodes.registerType('shelly mqtt device', ShellyMQTTDevice);
}
module.exports = function (RED) {
    function ShellyMQTTDevice(config) {
        RED.nodes.createNode(this, config);

        let stopEmitted = true; // Reset this to false only on input
        this.shellyConfig = RED.nodes.getNode(config.shellyDevice);

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
            });
            this.shellyConfig.eventEmitter.on('relay-state', (state) => {
                this.sendNodeMessage({ state });
            });
            this.shellyConfig.eventEmitter.on('relay-power', (power) => {
                this.sendNodeMessage({ power: +power });
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
        });

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

    RED.nodes.registerType('shelly mqtt device', ShellyMQTTDevice);
}
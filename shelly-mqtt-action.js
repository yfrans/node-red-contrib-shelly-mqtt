module.exports = function (RED) {
    function ShellyMQTTAction(config) {
        RED.nodes.createNode(this, config);

        updateNodeStatus(this, '');

        let shellyConfigNodes = {};
        RED.nodes.eachNode(n => {
            if (n.type === 'shelly-mqtt-config') {
                shellyConfigNodes[n.deviceName] = n.id;
            }
        });

        this.mqttConf = RED.nodes.getNode(config.mqttBroker);
        this.mqttConf.client.on('connect', () => {
            updateNodeStatus(this, 'connected');
        });
        this.mqttConf.client.on('close', () => {
            updateNodeStatus(this, 'disconnected');
        });

        this.on('input', (msg) => {
            switch (msg.action) {
                case 'open':
                case 'close':
                case 'stop':
                case 'rc':
                    this.mqttConf.client.publish(`shellies/${msg.device}/roller/0/command`, msg.action);
                    break;
                case 'on':
                case 'off':
                    if (!isNaN(msg.relay)) {
                        this.mqttConf.client.publish(`shellies/${msg.device}/relay/${msg.relay}/command`, msg.action);
                    }
                    break;
                case 'update':
                    this.mqttConf.client.publish(`shellies/${msg.device}/command`, msg.action);
                    break;
                case 'last-state':
                    if (shellyConfigNodes[msg.device]) {
                        let node = RED.nodes.getNode(shellyConfigNodes[msg.device]);
                        if (node) {
                            node.emitCachedState();
                            /*Object.keys(node.lastState).forEach(topic => {
                                this.mqttConf.client.publish(topic, node.lastState[topic]);
                            });*/
                        }
                    }
                    break;
            }
        });
    }

    function updateNodeStatus(node, status) {
        if (status === 'connected') {
            node.status({ fill: 'green', shape: 'dot', text: `connected` });
        } else if (status === 'disconnected') {
            node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
        } else {
            node.status({ fill: 'orange', shape: 'ring', text: 'connecting...' });
        }
    }

    RED.nodes.registerType('shelly mqtt action', ShellyMQTTAction);
}
const events = require("events");
const announce = require("./announce");

module.exports = function (RED) {
  function ShellyMQTTConfig(config) {
    RED.nodes.createNode(this, config);

    this.eventEmitter = new events.EventEmitter();

    this.mqttConf = RED.nodes.getNode(config.mqttBroker);
    this.config = config;

    this.ipAddress = "";
    this.lastState = {};
    this.subscriptions = [];

    // Connect to MQTT
    if (this.mqttConf) {
      this.mqttConf.connect();
      this.mqttConf.client.on("connect", () => handleConnected(this));
      this.mqttConf.client.on("close", () => {
        this.eventEmitter.emit("disconnected");
      });
    }

    // Node close
    this.on("close", (removed, done) => {
      this.subscriptions.forEach((s) => this.mqttConf.unsubscribe(s));
      this.subscriptions = [];
      done();
    });

    // Emit device state (and also cache it)
    this.emit = function (topic, payload) {
      this.lastState[topic] = payload;
      this.eventEmitter.emit(topic, payload);
    };

    // Handle device announcement message
    this.handleAnnounceMessage = (announceMessage) => {
      this.ipAddress = announceMessage.ip;
      if (this.config.haDiscovery) {
        publishDiscoveryMessage(this);
      }
    };

    // Handle device action message
    this.sendDeviceAction = (msg) => {
      if (!this.mqttConf) {
        return false;
      }

      if (msg.action) {
        return handleAction(this, msg);
      } else if (msg.position) {
        return handlePosition(this, msg);
      }

      return false;
    };

    // Send cached state to subscribers
    this.emitCachedState = () => {
      Object.keys(this.lastState).forEach((topic) => {
        this.eventEmitter.emit(topic, this.lastState[topic]);
      });
    };

    // Subscribe to device topic
    this.subscribe = (topic, handler, isFullTopic = false) => {
      topic = isFullTopic ? topic : `shellies/${this.config.deviceName}/${topic}`;
      this.mqttConf.subscribe(topic, { qos: 0 }, (topic, payload) => {
        let res = handler(this, topic, payload.toString());
        if (res) {
          if (Array.isArray(res)) {
            this.emit(res[0], res[1]);
          } else {
            this.emit(res, payload.toString());
          }
        }
      });
      this.subscriptions.push(topic);
    };
  }

  // Handle cover position message
  function handlePosition(device, message) {
    let pos = +message.position;
    if (isNaN(pos) || pos < 0 || pos > 100) {
      device.error("incorrect position value");
      return false;
    }

    device.mqttConf.client.publish(`shellies/${device.config.deviceName}/roller/0/command/pos`, pos.toString());
    return true;
  }

  // Handle generic action message
  function handleAction(device, message) {
    if (!["open", "close", "stop", "on", "off"].includes(message.action)) {
      device.error("got unknown command: " + message.action);
      return false;
    }

    if (device.config.channel === "cover") {
      const rollerTopic = `shellies/${device.config.deviceName}/roller/0/command`;
      device.mqttConf.client.publish(rollerTopic, message.action);
      if (message.action !== "stop" && message.optime > 0) {
        setTimeout(() => {
          device.mqttConf.client.publish(rollerTopic, "stop");
        }, message.optime);
      }
    } else {
      if (device.config.deviceType === "vintage" || device.config.deviceType === "dimmer") {
        device.mqttConf.client.publish(
          `shellies/${device.config.deviceName}/light/0/set`,
          JSON.stringify({
            turn: message.action,
            brightness: message.brightness || 100
          })
        );
      } else {
        device.mqttConf.client.publish(
          `shellies/${device.config.deviceName}/relay/${device.config.channel}/command`,
          message.action
        );
      }
    }
    return true;
  }

  // Publish discovery (announcement) message
  function publishDiscoveryMessage(node) {
    if (node.config.deviceType === "2.5") {
      if (node.config.channel === "cover") {
        announce.cover(node);
      } else {
        announce.relay(node);
      }
    } else if (node.config.deviceType === "1pm") {
      announce.relay(node);
    } else if (node.config.deviceType === "vintage" || node.config.deviceType === "dimmer") {
      announce.dimmer_vintage(node);
    }
  }

  // MQTT ready and connected
  function handleConnected(node) {
    node.eventEmitter.emit("connected");

    node.subscribe(`announce`, (n, t, m) => {
      try {
        let json = JSON.parse(m.toString());
        node.handleAnnounceMessage(json);
        return ["announce", json];
      } catch {}
    });
    node.subscribe("online", () => "online");

    node.mqttConf.client.publish(`shellies/${node.config.deviceName}/command`, "announce"); // Get device information
    node.mqttConf.client.publish(`shellies/${node.config.deviceName}/command`, "update"); // Force device to report the current state

    if (node.config.deviceType === "2.5" || node.config.deviceType === "1pm") {
      if (node.config.channel === "cover") {
        node.subscribe(`roller/0`, () => "roller-action");
        node.subscribe(`roller/0/pos`, () => "roller-position");
        node.subscribe(`roller/0/power`, () => "roller-power");
        node.subscribe(`roller/0/energy`, () => "roller-energy");
      } else {
        node.subscribe(`relay/${node.config.channel}`, () => "relay-state");
        node.subscribe(`input_event/${node.config.channel}`, () => "event");
        node.subscribe(`relay/${node.config.channel}/power`, () => "relay-power");
        node.subscribe(`relay/${node.config.channel}/energy`, () => "relay-energy");
      }
    } else if (node.config.deviceType === "vintage" || node.config.deviceType === "dimmer") {
      node.subscribe(`light/0/status`, () => "light-status");
      node.subscribe(`light/0/power`, () => "light-power");
    } else if (node.config.deviceType === "i3") {
      node.subscribe(`input_event/${node.config.channel}`, () => "event");
    }
  }

  RED.nodes.registerType("shelly-mqtt-config", ShellyMQTTConfig);
};

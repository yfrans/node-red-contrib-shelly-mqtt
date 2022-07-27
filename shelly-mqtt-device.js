module.exports = function (RED) {
  function ShellyMQTTDevice(config) {
    RED.nodes.createNode(this, config);

    this.stopEmitted = true; // Reset this to false only on input
    this.shellyDevice = RED.nodes.getNode(config.shellyDevice);
    this.lastState = {};
    this.eventCount = 0;

    const emitStop = config.action !== "stop" && config.emitStop;

    // Send message from node
    this.sendNodeMessage = (payload) => {
      this.send({
        device: this.shellyDevice.config.deviceName,
        payload
      });
    };

    // Subscribe to all relevant device events
    subscribeToDeviceEvents(this, config, emitStop);

    // Handle node input
    this.on("input", (msg) => {
      this.stopEmitted = false;

      if (this.shellyDevice.sendDeviceAction(msg)) {
        return;
      }

      if (config.action && config.action.length > 0) {
        if (config.action === "position") {
          msg.position = config.position;
        } else {
          msg.action = config.action;
          msg.optime = config.optime;
          msg.brightness = config.brightness;
        }
        this.shellyDevice.sendDeviceAction(msg);
      }
    });
  }

  function tryParseJson(input) {
    try {
      return JSON.parse(input);
    } catch (ex) {
      console.error("error while parsing json", ex);
      return null;
    }
  }

  function subscribeToDeviceEvents(device, config, emitStop) {
    device.shellyDevice.eventEmitter.on("connected", () => updateNodeStatus(device, "connected"));
    device.shellyDevice.eventEmitter.on("disconnected", () => updateNodeStatus(device, "disconnected"));
    device.shellyDevice.eventEmitter.on("roller-action", (action) => {
      if (emitStop) {
        if (action === "stop" && !device.stopEmitted) {
          device.stopEmitted = true;
          setTimeout(() => {
            device.sendNodeMessage(null);
          }, 500);
        }
      } else {
        device.sendNodeMessage({ action });
      }
      device.lastState.rollerAction = action;
      updateNodeStatus(device, device.lastState);
    });

    if (emitStop) {
      // We don't want to register to the other events here
      return;
    }

    device.shellyDevice.eventEmitter.on("light-status", (status) => {
      status = tryParseJson(status);
      if (!status) {
        return;
      }
      device.sendNodeMessage({ light: status.ison, brightness: status.brightness });
      device.lastState.light = status.ison;
      device.lastState.brightness = status.brightness;
      updateNodeStatus(device, device.lastState);
    });
    device.shellyDevice.eventEmitter.on("roller-position", (position) => {
      device.sendNodeMessage({ position: +position });
      device.lastState.position = position;
      updateNodeStatus(device, device.lastState);
    });
    device.shellyDevice.eventEmitter.on("relay-state", (state) => {
      device.sendNodeMessage({ state });
      device.lastState.channel = state;
      updateNodeStatus(device, device.lastState);
    });
    device.shellyDevice.eventEmitter.on("relay-power", (power) => {
      device.sendNodeMessage({ power: +power });
      device.lastState.power = power;
      updateNodeStatus(device, device.lastState);
    });
    device.shellyDevice.eventEmitter.on("event", (message) => {
      message = tryParseJson(message);

      if (!message) {
        return;
      }

      let eventCount = +message.event_cnt;
      if (isNaN(eventCount)) {
        eventCount = 0;
      }

      if (this.eventCount === eventCount) {
        // Old event, skip
        return;
      }

      this.eventCount = eventCount;

      if (
        config.event === "any" ||
        (config.event === "short" && message.event === "S") ||
        (config.event === "long" && message.event === "L") ||
        (config.event === "double" && message.event === "SS") ||
        (config.event === "triple" && message.event === "SSS") ||
        (config.event === "short long" && message.event === "SL") ||
        (config.event === "long short" && message.event === "LS")
      ) {
        device.sendNodeMessage({
          event: message.event,
          count: message.event_cnt
        });
      }
    });
  }

  function updateNodeStatus(node, status) {
    if (status === "connected") {
      node.status({ fill: "green", shape: "dot", text: `connected` });
    } else if (status === "disconnected") {
      node.status({ fill: "red", shape: "ring", text: "disconnected" });
    } else {
      let statusString = null;
      if (status.channel) {
        statusString = `channel: ${status.channel}`;
      } else if (status.rollerAction) {
        statusString = `roller: ${status.rollerAction}`;
        if (status.position) {
          statusString += ` | ${status.position}%`;
        }
      } else if ("light" in status) {
        statusString = status.light ? "on" : "off";
        if (status.brightness) {
          statusString += ` (${status.brightness}%)`;
        }
      }

      if (statusString && status.power) {
        statusString += ` | ${status.power}w`;
      }

      if (statusString) {
        node.status({ fill: "green", shape: "dot", text: statusString });
      }
    }
  }

  RED.nodes.registerType("shelly mqtt device", ShellyMQTTDevice);
};

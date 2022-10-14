module.exports = function (RED) {
  function ShellyMQTTDevice(config) {
    RED.nodes.createNode(this, config);

    this.stopEmitted = true; // Reset this to false only on input
    this.shellyDevice = RED.nodes.getNode(config.shellyDevice);
    this.lastState = {};
    this.eventCount = 0;

    const emitStop = config.action !== "stop" && config.emitStop;

    // Send status message from node
    this.sendStatusMessage = (status) => {
      this.send([
        {
          device: this.shellyDevice.config.deviceName,
          status
        },
        null
      ]);
    };

    this.sendEventMessage = (event) => {
      this.send([
        null,
        {
          device: this.shellyDevice.config.deviceName,
          ...event
        }
      ]);
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
          if (config.action === "toggle") {
            let newState = null;
            if (this.lastState.channel) {
              newState = this.lastState.channel === "on" ? "off" : "on";
            } else if ("light" in this.lastState) {
              newState = this.lastState.light ? "off" : "on";
            }
            if (!newState) {
              return;
            }
            msg.action = newState;
          } else {
            msg.action = config.action;
          }
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
            device.sendStatusMessage(null);
          }, 500);
        }
      } else {
        device.sendStatusMessage({ action });
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
      device.sendStatusMessage({ light: status.ison, brightness: status.brightness });
      device.lastState.light = status.ison;
      device.lastState.brightness = status.brightness;
      updateNodeStatus(device, device.lastState);
    });
    device.shellyDevice.eventEmitter.on("roller-position", (position) => {
      device.sendStatusMessage({ position: +position });
      device.lastState.position = position;
      updateNodeStatus(device, device.lastState);
    });
    device.shellyDevice.eventEmitter.on("relay-state", (state) => {
      device.sendStatusMessage({ state });
      device.lastState.channel = state;
      updateNodeStatus(device, device.lastState);
    });
    device.shellyDevice.eventEmitter.on("relay-power", (power) => {
      device.sendStatusMessage({ power: +power });
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

      if (device.eventCount === eventCount) {
        // Old event, skip
        return;
      }

      device.eventCount = eventCount;

      if (
        config.event === "any" ||
        (config.event === "short" && message.event === "S") ||
        (config.event === "long" && message.event === "L") ||
        (config.event === "double" && message.event === "SS") ||
        (config.event === "triple" && message.event === "SSS") ||
        (config.event === "short long" && message.event === "SL") ||
        (config.event === "long short" && message.event === "LS")
      ) {
        device.sendEventMessage({
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

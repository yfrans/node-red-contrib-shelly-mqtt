const DISCOVERY_PREFIX = "homeassistant";

function getConfigObject(node, add = {}) {
  return Object.assign(
    {
      "~": `shellies/${node.config.deviceName}`,
      availability_topic: "~/online",
      payload_available: "true",
      payload_not_available: "false",
      name: node.config.name,
      unique_id: node.config.deviceName,
      device: {
        identifiers: [node.config.deviceName],
        name: node.config.deviceName,
        manufacturer: "Allterco Robotics LTD",
        configuration_url: `http://${node.ipAddress}`
      }
    },
    add
  );
}

module.exports = {
  cover: function (node) {
    let config = getConfigObject(node, {
      command_topic: "~/roller/0/command",
      state_topic: "~/roller/0",
      position_topic: "~/roller/0/pos",
      set_position_topic: "~/roller/0/command/pos",
      payload_close: "close",
      payload_open: "open",
      payload_stop: "stop",
      position_closed: 0,
      position_open: 100,
      state_closed: "close",
      state_open: "open",
      state_stopped: "stop"
    });
    config.unique_id += "-cover";
    node.mqttConf.client.publish(`${DISCOVERY_PREFIX}/cover/${config.unique_id}/config`, JSON.stringify(config));

    config = getConfigObject(node, {
      state_topic: "~/roller/0/power",
      state_class: "measurement",
      unit_of_measurement: "W",
      device_class: "power"
    });
    config.unique_id += "-cover-power";
    config.name += " power";
    node.mqttConf.client.publish(`${DISCOVERY_PREFIX}/sensor/${config.unique_id}/config`, JSON.stringify(config));

    config = getConfigObject(node, {
      state_topic: "~/roller/0/energy",
      state_class: "total_increasing",
      unit_of_measurement: "kWh",
      value_template: "{{(value|float/60/1000)|round(2)}}",
      device_class: "energy"
    });
    config.name += " energy";
    config.unique_id += `-cover-energy`;
    node.mqttConf.client.publish(`${DISCOVERY_PREFIX}/sensor/${config.unique_id}/config`, JSON.stringify(config));
  },
  relay: function (node) {
    let config = getConfigObject(node, {
      command_topic: `~/relay/${node.config.channel}/command`,
      state_topic: `~/relay/${node.config.channel}`,
      payload_off: "off",
      payload_on: "on"
    });
    config.unique_id += `-relay${node.config.channel}`;
    node.mqttConf.client.publish(`${DISCOVERY_PREFIX}/light/${config.unique_id}/config`, JSON.stringify(config));

    config = getConfigObject(node, {
      state_topic: `~/relay/${node.config.channel}/power`,
      state_class: "measurement",
      unit_of_measurement: "W",
      device_class: "power"
    });
    config.unique_id += `-relay${node.config.channel}-power`;
    config.name += " power";
    node.mqttConf.client.publish(`${DISCOVERY_PREFIX}/sensor/${config.unique_id}/config`, JSON.stringify(config));

    config = getConfigObject(node, {
      state_topic: `~/relay/${node.config.channel}/energy`,
      state_class: "total_increasing",
      unit_of_measurement: "kWh",
      value_template: "{{(value|float/60/1000)|round(2)}}",
      device_class: "energy"
    });
    config.name += " energy";
    config.unique_id += `-relay${node.config.channel}-energy`;
    node.mqttConf.client.publish(`${DISCOVERY_PREFIX}/sensor/${config.unique_id}/config`, JSON.stringify(config));
  },
  vintage: function (node) {
    let config = getConfigObject(node, {
      command_topic: `~/light/0/set`,
      state_topic: `~/light/0/status`,
      schema: "template",
      state_template: "{% if value_json.ison %}on{% else %}off{% endif %}",
      command_off_template: '{ "turn": "off" }',
      command_on_template:
        '{ "turn": "on"{% if brightness is defined %}, "brightness": {{ brightness | float | multiply(0.39215686) | round(0) }}{% endif %}}',
      brightness_template: "{{ value_json.brightness | float | multiply(2.55) | round(0) }}"
    });
    config.unique_id += `-light`;

    node.mqttConf.client.publish(`${DISCOVERY_PREFIX}/light/${config.unique_id}/config`, JSON.stringify(config));

    config = getConfigObject(node, {
      state_topic: `~/light/0/power`,
      state_class: "measurement",
      unit_of_measurement: "W",
      device_class: "power"
    });
    config.unique_id += `-light-power`;
    config.name += " power";
    node.mqttConf.client.publish(`${DISCOVERY_PREFIX}/sensor/${config.unique_id}/config`, JSON.stringify(config));

    config = getConfigObject(node, {
      state_topic: `~/light/0/energy`,
      state_class: "total_increasing",
      unit_of_measurement: "kWh",
      value_template: "{{(value|float/60/1000)|round(2)}}",
      device_class: "energy"
    });
    config.name += " energy";
    config.unique_id += `-light-energy`;
    node.mqttConf.client.publish(`${DISCOVERY_PREFIX}/sensor/${config.unique_id}/config`, JSON.stringify(config));
  }
};

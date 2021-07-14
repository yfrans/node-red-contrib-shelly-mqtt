# node-red-contrib-shelly-mqtt
Shelly MQTT support for Node-Red.

### Configuration
This node includes a simple config node which accepts MQTT broker (same as native Node-Red MQTT config instance) and device name. The device name is the topic prefix of the device (without shellies/).

For example, if your device is using the topic: ```shellies/shellyswitch25-abcdefg``` then your device name is ```shellyswitch25-abcdefg```.

### Usage
The Shelly-Device node accepts one input and emit one output. The input is used to control the device through message object:
- msg.action = ```on``` or ```off``` for relay, ```open```, ```close``` or ```stop``` for roller devices
- msg.position = position in percentage for roller devices
- msg.optime = the operation time (milliseconds) of the required action (roller only, very useful for venetian blinds)

The output will emit the current status of the relay for relay devices or the current status and position of the roller for roller devices. It is also emits the current power of the relay, but mosly for inner testing. Use it if you want :)

And of course - you can also set the action from the UI (the node will try the input message if defined and then fall back to the UI action).

### Emit stop
Use this flag to set the device to report only a ```stop``` action after the required operation (from input) is completed. You can use this to chain multiple actions one by one.

### Node name (extra feature)
The node name, if not set, is taken from the configuration node together with the action, so the node name resulting in a nice string describing the required action without setting the name in the UI.

You can also use your own name and add ```*``` at the end so the node will add the action to your custom name (for example: ```my node name*```).
# Architecture/code patterns: IoT Message processing from external systems using Azure Durable Functions

> DISCLAIMER: The code and all other documents in this repository are provided as is under MIT License.

Many Azure IoT projects use Azure Functions in some way or form as serverless runtime to do processing on messages. While this works fine in simple scenarios, more complex scenarios might become unreliable, difficult to monitor, or unwieldy. 

Azure Durable Functions make life easier by allowing you to write stateful workflows using orchestrator functions. Using these orchestrators you won't have to worry about managing (or passing through) state, timeouts, restarts, etc.

This document will describe a sample scenario and architecture for this pattern.

**Disclaimer: this code sample shows a pattern, it does not implement all (code) best practices regarding security, validation, testing, etc.**

## Scenario: Ingesting and enriching messages from a third party solution into IoT Hub.
![Architecture](/assets/architecture.png "Architecture")

In this scenario we are building a solution that ingests messages into IoT Hub from a third party system, in this case as a Lora network server. To ingest the messages to IoT Hub we use a modified version of the [IoT Central Bridge](https://github.com/Azure/iotc-device-bridge), this modification adds the ability to send reported as well as desired properties to the relevant device twins in IoT Hub. Most parts of this solution should also work with IoT Central rather than IoT Hub. The bridge ingests messages and posts them as the corresponding individual (impersonated) devices from the source system. 

Before we do that however, we want to enrich the messages. In this sample, the messages might contain location data, but we're in fact interested in the specified 'zones' in which a device/tracker/vehicle is in, not the raw location. Secondly, we're interested to see if these locations are marked as safe or not and add that as a flag to the incoming message. Thirdly, we want to trigger an alert to the Lora device if it turns out to be in an unsafe zone, we call this (in Lora terms) a downlink message and it is triggered by changing the device twin. Lastly, we configure Lora to send messages more frequently if one or more zones are unsafe (in distress) by setting a broadcast setting on the gateways (this setting is in fact represented as the property of a 'broadcast' device in IoT Hub).

We also include a set of APIs that allow a user to read or change the geofences that are defined, and the status of the zones. These are stored in a Storage Table for zone states, and a Blob store for the GeoJSON zone definitions. Lastly, we copy the telemetry (both latest, as well as history) and the device twins to a Cosmos DB to prevent end-users from getting into throttling limits in IoT Hub. Someone could build a complete safety dashboard using these APIs and the information that's stored into Cosmos DB.

The solution contains the following functions:
* **OrchestratorStarter**: this function acts as HTTP endpoint to get the incoming message and start the orchestrator function. May be replaced by a function that retrieves, for example, an Event Hub message. An example message can be found is example.json in the function folder.
* **ProcessMessage**: describes the sequence of functions to be called and state to be passed through. It also includes some built-in functions to track status, etc.
* **EnrichGeofence**: binds a file from Azure blob storage as input where the definition of the zones (geofences) can be found (example in example.json) in GeoJSON format and performs a check for each defined geofence to see if the device is in this zone and adds this as a measurement to the message.
* **EnrichZoneStatus**: checks the matched zone (names) against an Azure Table (partition) to see what the status of the matched zones are, the result is added as 'distress' property in the message. The table rows should have a partitionkey (this is the same for all entries), rowkey (the unique identifier of the zone), and a 'Distress' property with an integer. 
* **UplinkBridge**: finally the message is forwarded to an IoT Hub with device-specific credentials (the function will retrieve/create those). *Be aware that in product scenarios it is strongly advised to cache the connection strings.*
* **Downlink**: Once a device twin is changed (most likely due to the 'distress' state changing), this will trigger an event with the updated twin to be put onto the event hub, which this functions will pick up. The function will forward this to the downlink service of the specific Lora provider on a HTTPS endpoint defined in app settings.
* **TwinReplication**: Since the IoT Hub imposes throttling limits on reading the device twins, we replicate the twins to a Cosmos DB container. This function is fed by the same event hub with twin change events as the above Downlink function.

And for the APIs:
* **getZones**: This function provides an API endpoint for GETting the entire GeoJSON with zone definitions.
* **getZoneStatus**: This function will GET the latest zone status for all zones (from table storage).
* **putZones**: This function allows a user to replace the GeoJSON with zone definitions. Please make sure to follow the right format, as represented in the example.json. When a new GeoJSON is uploaded, this function also makes sure to delete any zones from the status table that do not exist anymore, or create the ones that are new.
* **putZoneStatus**: This function allows a user to PUT the distress status of a specific zone. It will also turn on or off the 'broadcast' capability of the gateways by changing the properties of a 'broadcast' device depending on if any zones are in distress (which will in turn trigger the downlink).


You will need to set the following app settings (or local.settings.json when testing locally):
```javascript
    "AzureWebJobsStorage": "connection-string-to-storage-account",
    "StorageConnection": "connection-string-to-storage-account",
    "uplinkIdScope": "-id-scope-from-iot-hub",
    "uplinkSasToken": "sas-token-from-iot-hub",
    "uplinkRegistrationHost": "global.azure-devices-provisioning.net",
    "zoneDefinitionPath": "folder/file.json",
    "zoneStatusPartition":"name-of-partition"
    "uplinkClientConnectionString": "A managenement key for the IoT Hub",
    "EventHubIngestConnectionstring": "Connection string for all the event hubs",
    "tripletDBendpoint":"Cosmos DB endpoint for the Device Twin DB",
    "tripletDBkey": "Key for the Device Twin DB",
    "tripletDBname": "Name of the Device Twin Database",
    "tripletDBcontainer": "Container of the Device Twin DB",
    "downlinkHost": "Downlink host",
    "downlinkPath": "Downlink Path"
```

Note that you will need to deploy:
* A storage account with a table ( 'zones') and a blob container ('zones').
* An IoT Hub with Device Provisioning Service and a enrollment group defined. The key from the enrollment group is the one we use as sas token. You can get the IdScope from the DPS instance. Also make sure to configure a route in the IoT Hub that outputs all twin changes to the 'twinchanges' event hub.
* An Azure Functions app to deploy all these functions to.
* An event hub namespace with 3 event hubs: 'twinchanges' (where changes will be posted), 'twtgingest' (where messages will be ingested from) and 'alldevicetelemetry'. You can obviously change the names to your liking, also make sure that each reader has it's own consumer group. 
* Two stream analytics jobs, one to stream telemetry to a history collection in Cosmos DB with all telemetry, one to stream telemetry to a collection with the current state (that gets overwritten every time). For the first one use the 'alldevicetelemetry' event hub as input and the Cosmos DB as output (the collection called 'telemetry'). For the second case put the same event hub as input, but use the 'latesttelemetry' colection and make sure to enable the option in Stream analaytics to overwrite records ('Document ID') based on de deviceId. The queries are the same for both jobs: 
```
SELECT
    *, GetMetadataPropertyValue(telemetry, '[EventHub].[IoTConnectionDeviceId]') AS deviceId
INTO
    cosmos
FROM
    telemetry
```


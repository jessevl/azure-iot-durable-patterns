# Architecture/code patterns: IoT Message processing using Azure Durable Functions

> DISCLAIMER: The code and all other documents in this repository are provided as is under MIT License.

Many Azure IoT projects use Azure Functions in some way or form as serverless runtime to do processing on messages. While this works fine in simple scenarios, more complex scenarios might become unreliable, difficult to monitor, or unwieldy. 

Azure Durable Functions make life easier by allowing you to write stateful workflows using orchestrator functions. Using these orchestrators you won't have to worry about managing (or passing through) state, timeouts, restarts, etc.

This document will describe two sample scenarios and architectures. One of which is currently included as a code sample, the other will be added later.

**Disclaimer: this code sample shows a pattern, it does not implement all best practices regarding security, validation, testing, etc.**

## Scenario 1: Ingesting and enriching messages from a third party solution into IoT Hub.
![Scenario 1](/assets/pattern-scenario-1.png "Scenario 1")

In this scenario we are building a solution that ingests messages into IoT Hub from a third party system, such as a Lora Gateway server. To ingest the messages to IoT Hub we use a modified version of the [IoT Central Bridge](https://github.com/Azure/iotc-device-bridge). The bridge ingests messages and posts them as the corresponding individual (impersonated) devices in the source system. Before we do that however, we want to enrich the messages. In this sample, the messages might contain location data, but we're in fact interested in the specified 'zones' in which a device/tracker/vehicle is in, not the raw location. Secondly, we're interested to see if these locations are marked as safe or not and add that as a flag to the incoming message.

As you can imagine these two enrichments and bridge functionality are seperate Azure Functions, but in this example we'll use a durable function to orchestrate these.

The solution contains the following functions:
* **OrchestratorStarter**: this function acts as HTTP endpoint to get the incoming message and start the orchestrator function. May be replaced by a function that retrieves, for example, an Event Hub message. An example message can be found is example.json in the function folder.
* **ProcessMessage**: describes the sequence of functions to be called and state to be passed through. It also includes some built-in functions to track status, etc.
* **EnrichGeofence**: binds a file from Azure blob storage as input where the definition of the zones (geofences) can be found (example in example.json) and performs a check for each defined geofence to see if the device is in this zone and adds this as a measurement to the message.
* **EnrichZoneStatus**: checks the matched zone (names) against an Azure Table (partition) to see what the status of the matched zones are, the result is added as 'distress' measurement in the message. The table rows should have a partitionkey (this is the same for all entries), rowkey (the unique identifier of the zone), and a 'Distress' property with a boolean.
* **UplinkBridge**: finally the message is forwarded to an IoT Hub with device-specific credentials (the function will retrieve/create those). *Be aware that in product scenarios it is strongly advised to cache the connection strings.*

You will need to set the following app settings (or local.settings.json when testing locally):
```javascript
    "AzureWebJobsStorage": "connection-string-to-storage-account",
    "StorageConnection": "connection-string-to-storage-account",
    "uplinkIdScope": "-id-scope-from-iot-hub",
    "uplinkSasToken": "sas-token-from-iot-hub",
    "uplinkRegistrationHost": "global.azure-devices-provisioning.net",
    "zoneDefinitionPath": "folder/file.json",
    "zoneStatusPartition":"name-of-partition"
```

Note that you will need to deploy:
* A storage account with a table and a blob container.
* An IoT Hub with Device Provisioning Service and a enrollment group defined. The key from the enrollment group is the one we use as sas token. You can get the IdScope from the DPS instance.
* An Azure Functions app to deploy these functions to.

## Scenario 2: Performing multiple operations in parallel (decoding, transforming) based on an external configuration on messages after ingestion from IoT Hub.
![Scenario 2](/assets/pattern-scenario-2.png "Scenario 2")
Description and sample to be added.



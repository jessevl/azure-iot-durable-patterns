module.exports = async function (context, eventHubMessages) {    

    // Define and create Cosmos DB Client
    const endpoint = process.env["tripletDBendpoint"];
    const key = process.env["tripletDBkey"];
     
    const CosmosClient = require('@azure/cosmos').CosmosClient;
    const client = new CosmosClient({ endpoint, key });
    
    const databaseId = process.env["tripletDBname"];
    const containerId = process.env["tripletDBcontainer"];
    const partitionKey = { kind: "Hash", paths: ["/deviceid"] };
   
    const { database } = await client.databases.createIfNotExists({ id: databaseId });
    const { container } = await database.containers.createIfNotExists({ id: containerId });


    // Start Message processing
    for(var i = 0; i < eventHubMessages.length; i++) {
        
        // pick up device id from system properties
        var deviceid = context.bindingData.systemPropertiesArray[i]["iothub-connection-device-id"];   
        
        // Update event message with deviceid
        var updatedDeviceDetails = eventHubMessages[i];        
        updatedDeviceDetails["id"] = deviceid;
        updatedDeviceDetails["deviceid"] = deviceid;          

        await container.items.upsert(updatedDeviceDetails, partitionKey);

    }
};


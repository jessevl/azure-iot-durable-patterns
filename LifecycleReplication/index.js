module.exports = async function (context, myEventHubMessage) {    

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
    for(var i = 0; i < myEventHubMessage.length; i++) {
        
        // pick up device id from system properties
        var deviceid = context.bindingData.propertiesArray[i]["deviceId"];
        var eventType = context.bindingData.propertiesArray[i]["opType"];
        
        context.log("Executing lifecycle event " + eventType + " for device " + deviceid);
        
        // Update event message with deviceid
        var updatedDeviceDetails = myEventHubMessage[i]; 
        updatedDeviceDetails["id"] = deviceid;       
        updatedDeviceDetails["deviceid"] = deviceid;  
        updatedDeviceDetails["eventType"] = eventType;

        // Create or delete device triplet 
        if (eventType === "deleteDeviceIdentity") {

            container.item(deviceid, deviceid).delete();
            context.log("Deleted device " + deviceid + " from CosmosDB")

        } else if(eventType === "createDeviceIdentity") {

            container.items.upsert(updatedDeviceDetails, partitionKey);
            context.log("Created device " + deviceid + " in CosmosDB")

        } else {console.log("Nothing is happening")}
        
    }
};


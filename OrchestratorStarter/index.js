const df = require("durable-functions");

module.exports = async function (context, ehmsg) {
    
    //
    // The below object maps all values of the incoming message to a message that will be sent into IoT Hub.
    // This specific object is just a sample object that fits a certain Lora device, edit it to fit your device message.
    //

        var msg = {
                    device:{
                        deviceId:ehmsg.device_id,
                        deviceName: ehmsg.message.deviceName
                    },
                    measurements:{
                        location: ehmsg.message.object.location.latitude != 0 ? {lat: ehmsg.message.object.location.latitude,lon: ehmsg.message.object.location.longitude, outdated: false} : {outdated: true},
                        battery: ehmsg.message.object.battery,
                        mandown: ehmsg.message.object.man_down,
                        movement:ehmsg.message.object.movement,
                        tilt: ehmsg.message.object.tilt,
                        pressure: ehmsg.message.object.pressure,
                        temperature: ehmsg.message.object.temperature,
                        header: ehmsg.message.object.header,
                        nfclength: ehmsg.message.object.nfc_length,
                        relativealtitude: ehmsg.message.object.location.relative_altitude,
                        accuracy: ehmsg.message.object.location.accuracy,
                        deviceName: ehmsg.message.deviceName,
                    },
                    reportedProperties:{
                        distress: ehmsg.message.object.response
                    },
                    desiredProperties:{
                        
                    }
                };

                

    const client = df.getClient(context);
    const instanceId = await client.startNew("ProcessMessage", undefined, msg);

    context.log(`[v0.8] Started orchestration with ID = '${instanceId}'.`);
    context.log(JSON.stringify(ehmsg));
    context.log(JSON.stringify(msg));

    return client.createCheckStatusResponse(context.bindingData.req, instanceId);
};
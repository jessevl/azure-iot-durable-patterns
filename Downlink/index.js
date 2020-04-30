const axios = require('axios');

module.exports = async function (context, eventHubMessages) {
    context.log(`[v0.2] Downlink function called for message array ${eventHubMessages}`);

    for(var i = 0; i < eventHubMessages.length; i++) {
        var message = eventHubMessages[i];

        context.log(`Processed message ${message}`);
        
        let data = JSON.stringify({
                "idDevice": context.bindingData.systemPropertiesArray[i]["iothub-connection-device-id"],
                "distress": message.properties.desired.distress
            }  
        )
        
        await postDownlink(data);

        async function postDownlink(data) {
            try {
                const response = await axios({
                    method: 'post',
                    url: process.env["downlinkHost"]+process.env["downlinkPath"],
                    data: data
                });
                context.log(response.status);
                return;
    
            } catch (error){
                context.log(error);
                return;
            }
        }
        
    }
};



const axios = require('axios');

module.exports = async function (context, eventHubMessages) {
    context.log(`Downlink function called for message array ${eventHubMessages}`);
    
    await eventHubMessages.forEach((message, index) => {
        context.log(`Processed message ${message}`);
        
        let data = JSON.stringify({
                "idDevice": context.bindingData.systemPropertiesArray[index]["iothub-connection-device-id"],
                "distress": message.properties.desired.distress
            }  
        )

        try {
            const response = await axios({
                method: 'post',
                url: process.env["downlinkHost"]+process.env["downlinkPath"],
                data: data
            });
            context.log(response.status);

        } catch (error){
            context.log(error);
        }       
        
    });
};



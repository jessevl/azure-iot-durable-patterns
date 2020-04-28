const axios = require('axios');

module.exports = async function (context, eventHubMessages) {
    context.log(`JavaScript eventhub trigger function called for message array ${eventHubMessages}`);
    
    eventHubMessages.forEach((message, index) => {
        context.log(`Processed message ${message}`);
        
        let data = JSON.stringify({
                "idDevice": context.bindingData.systemPropertiesArray[index]["iothub-connection-device-id"],
                "distress": message.properties.desired.distress
            }  
        )

        context.log(JSON.stringify(data)); 

        axios({
            method: 'post',
            url: process.env["downlinkHost"]+process.env["downlinkPath"],
            data: data
        })
        .then(function (response){
            context.log(response.data);
            context.log(response.status);
        }).catch(function (error) {
            context.log(error);
        })
        .finally(function () {
            return;
        });  
       
        
    });
};



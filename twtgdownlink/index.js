module.exports = async function (context, eventHubMessages) {
    context.log(`JavaScript eventhub trigger function called for message array ${eventHubMessages}`);
    
    eventHubMessages.forEach((message, index) => {
        context.log(`Processed message ${message}`);
        
        var idDevice = context.bindingData.systemPropertiesArray[index]["iothub-connection-device-id"];
        var distress = message.properties.desired.distress;
        context.log('Sending distress mode '+ JSON.stringify(distress) + 'for device' + JSON.stringify(idDevice)); 
        
        const https = require('https')
        const data = JSON.stringify({
                "idDevice": idDevice,
                "distress": distress
            }  
        )

        const options = {
        hostname: 'add a nice endpoint here',
        port: 443,
        path: '/add path here',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
            }
        }

        const req = https.request(options, res => {
        console.log(`statusCode: ${res.statusCode}`)

        res.on('data', d => {
            process.stdout.write(d)
        })
        })

        req.on('error', error => {
        console.error(error)
        })

        req.write(data)
        req.end()

        // ADD 
        
    });
};



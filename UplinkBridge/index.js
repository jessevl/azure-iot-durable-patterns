module.exports = async function (context) {
    const handleMessage = require('./engine');

    const msg = context.bindings.msg;

    if (msg) {
        
        context.log(JSON.stringify(msg));

        const parameters = {
            idScope: process.env.uplinkIdScope,
            sasToken: process.env.uplinkSasToken,
            registrationHost: process.env.uplinkRegistrationHost,
            clientConnectionString: process.env.uplinkClientConnectionString,
            gatewayHost: process.env.gatewayHost
        };

        try {
            handleMessage(context, { ...parameters}, msg.device, msg.measurements, msg.reportedProperties, msg.desiredProperties);
            return msg;
        } catch (e) {
            return e;
        };

    }
};
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const crypto = require('crypto');
const axios = require('axios');
const iothub = require('azure-iothub');
var ProvisioningTransport = require('azure-iot-provisioning-device-mqtt').Mqtt;
var SymmetricKeySecurityClient = require('azure-iot-security-symmetric-key').SymmetricKeySecurityClient;
var ProvisioningDeviceClient = require('azure-iot-provisioning-device').ProvisioningDeviceClient;

const StatusError = require('./error').StatusError;
const registrationHost = 'global.azure-devices-provisioning.net';
const deviceCache = {};

/**
 * Forwards external telemetry messages for IoT Hub devices.
 * @param {{ context: Object }} context
 * @param {{ idScope: string, sasToken: string, registrationHost: string, gatewayHost: string }} parameters
 * @param {{ deviceId: string }} device 
 * @param {{ [field: string]: number }} measurements 
 * @param {{ [field: string]: Object }} reportedProperties 
 * @param {{ [field: string]: Object }} desiredProperties 
 * @param { String } timestamp 
 */
module.exports = async function (context, parameters, device, measurements, reportedProperties, desiredProperties, timestamp) {
    if (device) {
        if (!device.deviceId || !/^[a-zA-Z0-9\-_]+$/.test(device.deviceId)) {
            throw new StatusError('Invalid format: deviceId must be alphanumeric, lowercase, and may contain hyphens.', 400);
        }
    } else {
        throw new StatusError('Invalid format: a device specification must be provided.', 400);
    }

    if (!validateMeasurements(measurements)) {
        throw new StatusError('Invalid format: invalid measurement list.', 400);
    }

    // TODO: validate properties

    if (timestamp && isNaN(Date.parse(timestamp))) {
        throw new StatusError('Invalid format: if present, timestamp must be in ISO format (e.g., YYYY-MM-DDTHH:mm:ss.sssZ)', 400);
    }

    try {

        //
        // STEP 1: Grab device key from cache or grab new one from DPS.
        //

        if (deviceCache[device.deviceId] && deviceCache[device.deviceId].deviceKey) {
            context.log("Device (key) is in cache")
            
        } else {
            context.log("Device (key) is not in cache")
            var deviceRegistration = await getDeviceRegistration(parameters, device);
            // Grab new key
            deviceCache[device.deviceId] = {
                ...deviceCache[device.deviceId],
                deviceKey: deviceRegistration.deviceKey,
                registrationResult: deviceRegistration.registrationResult
            }
            
        }
        
       
        //
        // STEP 2: Send telemetry/measurements on behalf of device.
        //
        
        if(measurements) {
            context.log('There is telemetry for device'+ device.deviceId);
            await sendTelemetry(deviceCache[device.deviceId], measurements);
            context.log('Telemetry sent for'+ device.deviceId);
        }

        //
        // STEP 3: If reported properties or desired properties in msg: 
        // grab twin from IoT Hub.
        //

        let deviceTwin = {};

        if (reportedProperties || desiredProperties){
            deviceTwin = await getDeviceTwin(deviceCache[device.deviceId]);
            
        } 
                
        //
        // STEP 4: If there are reported properties in incoming msg, 
        // check if it is different from current & update reported if needed 
        // as well as save the new device twin to cache.
        //
        
        if (reportedProperties) {
            let needsUpdate = false;
            
            for(let key in reportedProperties){
                if (reportedProperties[key] != await deviceTwin.properties.reported[key]){
                    needsUpdate = true;
                }
            }

            if (needsUpdate) {
                context.log('Twin (reported) needs update '+ device.deviceId);

                await sendReported(deviceCache[device.deviceId], reportedProperties);
                context.log('Updated twin (reported) for device '+device.deviceId);
                
                
            } else {
                context.log('Twin (reported) is already up to date '+device.deviceId);
            }
        }

        //
        // STEP 5: If there are desired properties in incoming msg, 
        // check if it is different from current & update reported if needed 
        // as well as save the new device twin to cache.
        //

        if (desiredProperties) {
            let needsUpdate = false;

            for(let key in desiredProperties){
                if (desiredProperties[key] != await deviceTwin.properties.desired[key]){
                    needsUpdate = true;
                }
            }


            if (needsUpdate) {
                context.log('Twin (desired) needs update '+ device.deviceId);

                const registry = iothub.Registry.fromConnectionString(parameters.clientConnectionString);

                context.log('Get twin (desired) '+device.deviceId);
                
                let twin = await (await registry.getTwin(device.deviceId)).responseBody;
       
                var patch = {
                    properties: {
                        desired: desiredProperties
                    }
                };
                context.log('Obtained twin (desired) for device '+device.deviceId);

                let twinUpdate = await registry.updateTwin(twin.deviceId, patch, twin.etag);

                context.log('Updated twin (desired) for device ' + device.deviceId);

                
         
            } else {
                context.log('Twin (desired) already up to date '+device.deviceId);
            }
        }
   
    
    } catch (e) {
        // If the device was deleted, we remove its cached connection string
        if (e.name === 'DeviceNotFoundError' && deviceCache[device.deviceId]) {
            delete deviceCache[device.deviceId].connectionString;
        }
        context.log(e);
        throw new Error(`Unable to send telemetry for device ${device.deviceId}: ${e.message}`);
    } 

/**
 * @returns true if measurements object is valid, i.e., a map of field names to numbers or strings.
 */
function validateMeasurements(measurements) {
    if (!measurements || typeof measurements !== 'object') {
        return false;
    }

    // for (const field in measurements) {
    //     if (typeof measurements[field] !== 'number' && !measurements[field].isArray && typeof measurements[field] !== 'string' && !isLocation(measurements[field])) {
    //         return false;
    //     }
    // }

    return true;
}

/**
 * @returns true if a measurement is a location.
 */
function isLocation(measurement) {
    if (!measurement || typeof measurement !== 'object' || typeof measurement.lat !== 'number' || typeof measurement.lon !== 'number') {
        return false;
    }

    if ('alt' in measurement && typeof measurement.alt !== 'number') {
        return false;
    }

    return true;
}

/**
 * @returns deviceKey and registrationResult
 */
async function getDeviceRegistration(parameters, device) {
    const deviceId = device.deviceId;

    var symmetricKey = getDeviceKey(parameters, deviceId);
    var provisioningSecurityClient = new SymmetricKeySecurityClient(deviceId, symmetricKey);
    var provisioningClient = ProvisioningDeviceClient.create(registrationHost, parameters.idScope, new ProvisioningTransport(), provisioningSecurityClient);

    var result = {
        deviceKey: symmetricKey, 
        registrationResult: await provisioningClient.register()
    };

    return result;
}

/**
 * Computes a derived device key using the primary key.
 */
function getDeviceKey(parameters, deviceId) {
    const key = crypto.createHmac('SHA256', Buffer.from(parameters.sasToken, 'base64'))
        .update(deviceId)
        .digest()
        .toString('base64');

    return key;
}


function generateDeviceSAS(device) {
    var resourceUri = device.registrationResult.assignedHub+"/devices/"+device.registrationResult.deviceId;
    var signingKey = device.deviceKey;


    resourceUri = encodeURIComponent(resourceUri);

    // Set expiration in seconds
    var expires = (Date.now() / 1000) + 60 * 60;
    expires = Math.ceil(expires);
    var toSign = resourceUri + '\n' + expires;

    // Use crypto
    var hmac = crypto.createHmac('sha256', Buffer.from(signingKey, 'base64'));
    hmac.update(toSign);
    var base64UriEncoded = encodeURIComponent(hmac.digest('base64'));

    // Construct authorization string
    var token = "SharedAccessSignature sr=" + resourceUri + "&sig="
    + base64UriEncoded + "&se=" + expires;
    
    return token;
}


/**
 * Retrieves a twin
 */
async function getDeviceTwin(device) {
    context.log("Getting device twin.");
    var sas = generateDeviceSAS(device);

    var response = await axios({
        method: 'get',
        url: parameters.gatewayHost+device.registrationResult.deviceId+"/twin/",
        headers: {'sas_token': sas}
    })
    
    return response.data;
}

/**
 * Updates reported properties (twin)
 */
async function sendReported(device, reported) {
    context.log("Sending reported properties.");
    var sas = generateDeviceSAS(device);

    var response = await axios({
        method: 'post',
        url: parameters.gatewayHost+device.registrationResult.deviceId+"/properties/",
        headers: {'sas_token': sas},
        data: reported
    })
    
    return response.data;
}

/**
 * Sends telemetry
 */
async function sendTelemetry(device, telemetry) {
    context.log("Sending telemetry.");
    var sas = generateDeviceSAS(device);

    var response = await axios({
        method: 'post',
        url: parameters.gatewayHost+device.registrationResult.deviceId+"/",
        headers: {'sas_token': sas},
        data: telemetry
    })
    
    return response.data;
}


};
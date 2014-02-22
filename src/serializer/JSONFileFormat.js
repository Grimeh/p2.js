var jsonschema = require("../../node_modules/jsonschema/lib");

module.exports = JSONFileFormat;

/**
 * Defines a JSON file format that can be validated and have different versions.
 * @class JSONFileFormat
 * @constructor
 * @param {Object}      options
 * @param {Function}    getVersionFunc  A function that returns the version number given a JSON instance
 */
function JSONFileFormat(options){
    options = options || {};

    var settings = {
        getVersionFunc : function(instance){
            return instance.version || false;
        },
    };

    for(var key in options){
        settings[key] = options[key];
    }

    this.versions = [];
    this.upgraders = [];
    this.getVersionFunc = settings.getVersionFunc;
}

JSONFileFormat.prototype.stringify = function(){
    var obj = this.serialize.apply(this,arguments);
    if(obj)
        return JSON.stringify(obj);
    else
        return false;
};

JSONFileFormat.prototype.parse = function(world){
    return this.deserialize(JSON.parse(world));
};

/**
 * Add a version
 * @method addVersion
 * @param {Number}      version
 * @param {Function}    validator
 */
JSONFileFormat.prototype.addVersion = function(version,validator,options) {
    if(typeof(validator)=="object")
        JSONFileFormat.makeSchemaStrict(validator);
    this.versions.push({
        version : version,
        validator : validator,
    });
};

/**
 * Add an upgrader for a version pair. The upgrader function is able to take a JSON instance and upgrade it from "fromVersion" to "toVersion".
 * @method addUpgrader
 * @param {number}   fromVersion
 * @param {number}   toVersion
 * @param {Function} upgradeFunc
 */
JSONFileFormat.prototype.addUpgrader = function(fromVersion,toVersion,upgradeFunc) {
    this.upgraders.push({
        fromVersion : fromVersion,
        toVersion : toVersion,
        upgradeFunc : upgradeFunc,
    });
};

/**
 * Upgrade a JSON instance from its version to the current version
 * @method upgrade
 * @param  {Object}         instance
 * @return {Object|Boolean} The upgraded JSON, or false if something went wrong.
 */
JSONFileFormat.prototype.upgrade = function(instance){
    if(!instance){
        this.error = "Given instance is null";
        return false;
    }

    // Get version
    var version = this.getVersionFunc(instance);
    if(!version){
        this.error = "Could not get version from instance.";
        return false;
    }

    if(!this.validate(instance)){
        this.error = "The instance cannot be validated.";
        return false;
    }

    // Find upgrader
    var upgraders = this.upgraders;
    for(var i=0; i!==upgraders.length; i++){
        var u = upgraders[i];
        if(u.fromVersion == version){

            // Apply upgrader
            var upgraded = u.upgradeFunc(instance);

            // Continue upgrading until we are at latest version
            return this.upgrade( upgraded );
        }
    }

    // No matching upgrader was found. We are at the latest version.
    return instance;
};

/**
 * Validate an instance
 * @method validate
 * @param  {Object} instance
 * @return {Boolean}
 */
JSONFileFormat.prototype.validate = function(instance){

    // Get version
    var version = this.getVersionFunc(instance);
    if(!version) return false;

    // Find validator & validate
    for(var i=0; i!==this.versions.length; i++){
        var v = this.versions[i];
        if(v.version == version){
            if(typeof(v.validator) == "function")
                return v.validator(instance);
            else {
                var result = jsonschema.validate(instance,v.validator);
                this.validateResult = result;
                return result.errors.length == 0;
            }
        }
    }
};

/**
 * Makes a JSON-schema strict, by adding all strict flags.
 * @static
 * @method makeSchemaStrict
 * @param  {object} schema
 * @return {object} The same updated schema object
 */
JSONFileFormat.makeSchemaStrict = function makeSchemaStrict(schema){
    if(schema instanceof Array){
        for(var i=0; i<schema.length; i++){
            makeSchemaStrict(schema[i]);
        }
    } else if(schema instanceof Object && "type" in schema){
        schema.required = true;
        if(schema.type == "array"){
            schema.additionalItems = false;
            makeSchemaStrict(schema.items);
        } else if(schema.type == "object"){
            schema.additionalProperties = false;
            if(schema.properties){
                for(var property in schema.properties){
                    makeSchemaStrict(schema.properties[property]);
                }
            }
        } else if(schema.type instanceof Array){
            makeSchemaStrict(schema.type);
        }
    }
    return schema;
};

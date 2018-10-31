// var test = "Mar 16, 2010 00:00 AM";
var test = "2018-10-30-07:41:09";

String.prototype.replaceAt=function(index, replacement) {
    return this.substr(0, index) + replacement+ this.substr(index + replacement.length);
}

console.log(test.replaceAt(10,"T"));


var timestamp = new Date(Date.parse("2018-10-30T07:41:09"));

console.log(timestamp);
console.log(timestamp.toUTCString());
console.log(timestamp.toISOString());
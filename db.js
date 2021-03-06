var mongoose = require('mongoose')
  , hash = require('./hash')
  , config = require('./config');

// Schemas
/*reportedSchema = new mongoose.Schema({
  username: String,
  reporters: [String]
});

reportedSchema.methods.add = function (by) {
  if (!by) {
    console.err('[Report] Reporter has no ip.');
  } else {
    if (this.reporters.indexOf(by) === -1) {
      this.reporters.push(by);
    }
  }
};

bannedSchema = new mongoose.Schema({
  username: String,
  expires: Date
});*/

userSchema = new mongoose.Schema({
  username: { type: String, index: {unique: true}},
  firstname: String,
  lastname: String,
  email: {type: String, index: {unique: true}},
  password: String,
  verified: Boolean,
  chatCount: Number,
  msgCount: Number,
  reporters: [String],
  banned: Boolean,
  banExpiration: Date
});

userSchema.set('autoIndex', false);
userSchema.methods.validPassword = function (password) {
  return hash.validateHash(this.password, password);
};
userSchema.methods.report = function (by) {
  if (this.reporters.indexOf(by) === -1) {
    this.reporters.push(by.username);
    console.log(this.reporters);
    if (this.reporters.length % config.maxReports === 0) {
      this.banned = true;
      this.banExpiration = new Date(
        Date.now() +
        (this.reporters.length / config.maxReports) * config.banExpiration
      );
    }
  }
  this.save();
};

userSchema.methods.isBanned = function () {
  if (this.banned) {
    var now = new Date(Date.now());
    if (now >= this.banExpiration) {
      this.banned = false;
      this.save();
      return false;
    } else {
      return true;
    }
  } else {
    return false;
  }
};

// Models
//Reported = mongoose.model('Reported', reportedSchema);
//Banned = mongoose.model('Banned', bannedSchema);
User = mongoose.model('User', userSchema);

// Exports
//module.exports.Reported = Reported;
//module.exports.Banned = Banned;
module.exports.User = User;

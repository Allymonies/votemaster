const CronJob = require('cron').CronJob;
const Discord = require('discord.js');
const client = new Discord.Client();
const moment = require('moment');
const Promise = require('bluebird').Promise;
const Table = require("easy-table");
const db = require('sqlite');
const uuid = require('uuid/v4');

const dbp = db.open('./activity.sqlite', { Promise });

var prefix = "-";

const TIME_BETWEEN_PAYOUTS = 30;
const AUTH_TOKEN = "<AUTH TOKEN>"; //CHANGE THIS
const GUILD_ID = "386661754341687298";
const AFK_CHANNEL_ID = "386661754840678413";
const ELECTION_MANAGER = "115659366337740809";
const FREE_VOTE = "430166844825927680";
const BALLOT_CHANNEL = "430233443406708746"
const MIN_USERS_IN_CHANNEL = 2;
const genesis = moment("05/11/18", "MMDDYY"); //First seat reelection date
const exodus = moment("05/13/18", "MMDDYY"); //End of first seat reelection
const seatNames = ["seat_one","seat_three","seat_two"]; //Put the order elections run in here.
const seatNumbers = ["1","3","2"]; //Short form of above.
const electionScript = `
@here
**Seat %X Elections: (Re-elected on %R)**
There are no parties.
You may vote for as many canidates as you want.
You may not vote with alt accounts
Votes from unrecognized users will not be counted
Elections end at 12:00 PM CST %E
*If eligible, run !declare <emoji> to run*
%N
`
var requiredMessages = 75; //Messages required to be eligible
var requiredMinutes = (6*60); //Minuted required to be eligible
var masterGuild;
var paused = 0;

function timestamp() {
	return Math.floor(new Date() / 1000);
}

commands = {
	check: function (msg, args) {
		if (args.length == 1) {
			target = msg.author;
		} else {
			var mentioned = msg.mentions.users;
			var target = mentioned.first();
			if (!target) {
				msg.reply("Could not find user!");
				return;
			}
		}
		db.get('SELECT * FROM users WHERE id = ?', target.id).then((result) => {
			if (result) {
				var userMinutes = result.minutes;
				var userMessages = result.messages;
			} else {
				db.run("INSERT INTO users (id, last_message, messages, minutes) VALUES (?, 0, 0, 0)",target.id);
				var userMinutes = 0;
				var userMessages = 0;
			}
			if (userMinutes >= requiredMinutes || userMessages >= requiredMessages) {
				msg.reply("<@" + target.id + "> is eligible for voting!\nThey have " + userMinutes.toString() + " minutes in voice, and " + userMessages.toString() + " messages.");
			} else {
				msg.reply("<@" + target.id + "> is ineligible for voting.\nThey have " + userMinutes.toString() + " minutes in voice, and " + userMessages.toString() + " messages.");
			}
		}).catch(err => {
			console.trace("PROMISE REJECTION REEEEE.");
		});
	},
	clear: function (msg, args) {
		if (msg.author.id == ELECTION_MANAGER) {
			db.run("UPDATE users SET messages = 0, minutes = 0");
			msg.reply("All activity logs have been cleared!");
		} else {
			msg.reply("You are not the election manager.");
		}
	},
	pause: function (msg, args) {
		if (msg.author.id == ELECTION_MANAGER) {
			db.get('SELECT * FROM self WHERE field = ?', "paused").then((result) => {
				if (result.flag == 1) {
					paused = 0;
				} else {
					paused = 1;
				}
				db.run("UPDATE self SET flag = ? WHERE field = ?", paused, "paused");
				msg.reply("Pause status: " + paused.toString());
				console.log("Pause status: " + paused.toString());
			}).catch(err => {
				console.trace("PROMISE REJECTION REEEEE.");
			});
		} else {
			msg.reply("You are not the election manager.");
		}
	},
	declare: function(msg, args) {
		if (args.length == 2) {
			emoji = args[1]
			if (emoji.substring(0,1) == "<") {
				msg.reply("Custom emoji are not supported at this time!")
				return;
			}
			target = msg.author;
		} else {
			msg.reply("Please select an emoji!")
			return;
		}
		db.get('SELECT * FROM self WHERE field = ?', "election_active").then((result) => {
			if (result.flag == 0) {
				msg.reply("No elections are active!");
				return;
			}
			db.get('SELECT * FROM users WHERE id = ?', target.id).then((result) => {
				if (result) {
					var userMinutes = result.minutes;
					var userMessages = result.messages;
				} else {
					db.run("INSERT INTO users (id, last_message, messages, minutes) VALUES (?, 0, 0, 0)",target.id);
					var userMinutes = 0;
					var userMessages = 0;
				}
				if (userMinutes >= requiredMinutes || userMessages >= requiredMessages) {
					//User is eligible to run, let 'em run.
					db.get('SELECT * FROM nominees WHERE user_id = ? OR emoji_id = ?', target.id, emoji).then((result_b) => {
						if (result_b && result_b.user_id == target.id) {
							msg.reply("You are already running!");
							return;
						} else if (result_b && result_b.emoji_id == emoji) {
							msg.reply("That emoji has already been used!");
							return;
						}
						db.get('SELECT * FROM elections WHERE user_id = ?', target.id).then((result_c) => {
							if (result_c) {
								msg.reply("You are already a congressman!");
								return;
							}
							var daysSince = Math.abs(genesis.diff(moment().startOf('day'),"days")) % 42;
							var seatNumber = Math.floor(daysSince / 14)
							db.get('SELECT * FROM elections WHERE seat_name = ?', seatNames[seatNumber]).then((result_d) => {
								var ballots = client.channels.get("430233443406708746");
								ballots.messages.fetch(result_d.message_id).then(message => {
									message.react(emoji);
									message.edit(message.content + "\n" + emoji + " = <@" + target.id + ">");
									db.run("INSERT INTO nominees (user_id, emoji_id) VALUES (?, ?)", target.id, emoji);
									msg.reply("Your declaration has been registered.");
								}).catch(err => {
									console.trace("PROMISE REJECTION REEEEE.");
								});
							}).catch(err => {
								console.trace("PROMISE REJECTION REEEEE.");
							});
						}).catch(err => {
							console.trace("PROMISE REJECTION REEEEE.");
						});
					}).catch(err => {
						console.trace("PROMISE REJECTION REEEEE.");
					});
				} else {
					msg.reply("You are not eligible to run for congress.");
					return;
				}
			}).catch(err => {
				console.trace("PROMISE REJECTION REEEEE.");
			});
		}).catch(err => {
			console.trace("PROMISE REJECTION REEEEE.");
		});
	}
}

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
	masterGuild = client.guilds.resolve(GUILD_ID);
	db.get('SELECT * FROM self WHERE field = ?', "paused").then((result) => {
		paused = result.flag;
		console.log("Pause status: " + paused.toString());
	}).catch(err => {
		console.trace("PROMISE REJECTION REEEEE.");
	});
	masterGuild.channels.find("id",BALLOT_CHANNEL).messages.fetch({ limit: 50 });
});

function trackMinutes(id, result) {
	console.log("TRACK MINUTES FOR " + id);
	if (result) {
		console.log(id + " has " + result.minutes.toString() + " minutes.");
		var minutes = result.minutes;
	} else { 
		console.log(id + " could not be found, creating");
		db.run("INSERT INTO users (id, last_message, messages, minutes) VALUES (?, 0, 0, 0)",id).catch(err => {
		console.trace("PROMISE REJECTION REEEEE.");
		});
		var minutes = 0;
	}
	if (!paused) {
		minutes += 1;
		db.run("UPDATE users SET minutes = ? WHERE id = ?", minutes, id).catch(err => {
		console.trace("PROMISE REJECTION REEEEE." + err);
		});
	}
}

client.on('message', msg => {
	if (!msg.author.bot && msg.guild && msg.guild.id == GUILD_ID) {
		db.get('SELECT * FROM users WHERE id = ?', msg.author.id).then((result) => {
			if (result) {
				var lastMessage = result.last_message;
				var messages = result.messages;
			} else {
				db.run("INSERT INTO users (id, last_message, messages, minutes) VALUES (?, 0, 0, 0)",msg.author.id);
				var lastMessage = 0;
				var messages = 0;
			}
			if (timestamp() - lastMessage > TIME_BETWEEN_PAYOUTS) {
				if (!paused) {
					lastMessage = timestamp();
					messages += 1;
				}
			}
			db.run("UPDATE users SET last_message = ?, messages = ? WHERE id = ?", lastMessage, messages, msg.author.id);
			if (msg.content.substring(0,prefix.length) === prefix) {
				//Command
				args = msg.content.split(" ");
				if (typeof(commands[args[0].toLowerCase().substring(1)]) === "function") {
					commands[args[0].toLowerCase().substring(1)](msg, args);
				}
			}
		}).catch(err => {
			console.trace("PROMISE REJECTION REEEEE.");
		});
		//console.log((msg.member && msg.member.nickname ? msg.member.nickname : msg.author.username) + ": " + msg.content);
	} else {
		//Bot message
	}
});

client.on('messageReactionAdd', (messageReaction, user) => {
	if (user.id != FREE_VOTE && messageReaction.message.channel.id == BALLOT_CHANNEL) {
		//Check if they are allowed to vote.
		db.get('SELECT * FROM users WHERE id = ?', user.id).then((result) => {
			if (result) {
				var userMinutes = result.minutes;
				var userMessages = result.messages;
			} else {
				db.run("INSERT INTO users (id, last_message, messages, minutes) VALUES (?, 0, 0, 0)",user.id);
				var userMinutes = 0;
				var userMessages = 0;
			}
			if (userMinutes >= requiredMinutes || userMessages >= requiredMessages) {
				//Continue
				console.log("Eligible user voted.");
			} else {
				//Ineligble
				console.log("Removed inelligble vote.");
				messageReaction.users.remove(user.id);
				return false
			}
		}).catch(err => {
			console.trace("PROMISE REJECTION REEEEE.");
		});
	}
});

setInterval(function() {
	console.log("Checking voice. [Status: " + client.status.toString() + "]");
	if (client.status == 5) {
		process.exit(1);
	}
	var voiceStates = masterGuild.voiceStates.array()
	var channels = {};
	for (var i = 0; i < voiceStates.length; i++) {
		var arg = voiceStates[i];
		if (arg.channel_id != null && arg.channel_id != AFK_CHANNEL_ID) {
			if (channels[arg.channel_id] != null) {
				channels[arg.channel_id] += 1;
			} else {
				channels[arg.channel_id] = 1;
			}
		}
	}
	console.log(channels);
	for (var i = 0; i < voiceStates.length; i++) {
		var arg = voiceStates[i];
		if (arg.channel_id != null && arg.channel_id != AFK_CHANNEL_ID && channels[arg.channel_id] >= MIN_USERS_IN_CHANNEL) {
			db.get('SELECT * FROM users WHERE id = ?', arg.user_id).then(trackMinutes.bind(null, arg.user_id)).catch(err => {
				console.trace("PROMISE REJECTION REEEEE.");
			});/*)(result) => {
				if (result) {
					console.log(result.id + " has " + result.minutes.toString() + " minutes.");
					var minutes = result.minutes;
				} else { 
					console.log(
					console.log(result.id + " could not be found, creating");
					db.run("INSERT INTO users (id, last_message, messages, minutes) VALUES (?, 0, 0, 0)",arg.user_id);
					var minutes = 0;
				}
				if (!paused) {
					minutes += 1;
					db.run("UPDATE users SET minutes = ? WHERE id = ?", minutes, result.id);
				}
			});*/
		}
	}
	/*masterGuild.voiceStates.every(function(arg) {
		if (arg.channel_id != null && arg.channel_id != AFK_CHANNEL_ID) {
			db.get('SELECT * FROM users WHERE id = ?', arg.user_id).then((result) => {
				if (result) {
					var minutes = result.minutes;
				} else { 
					db.run("INSERT INTO users (id, last_message, messages, minutes) VALUES (?, 0, 0, 0)",arg.user_id);
					var minutes = 0;
				}
				if (!paused) {
					minutes += 1;
					db.run("UPDATE users SET minutes = ? WHERE id = ?", minutes, arg.user_id);
				}
			});
		}
	});*/
}, 60000);

var startElections = new CronJob({
	cronTime: '01 00 00 * * 5',
	onTick: function() {
		console.log("STARTING ELECTION.");
		var daysSince = Math.abs(genesis.diff(moment().startOf('day'),"days")) % 42;
		var seatNumber = Math.floor(daysSince / 14);
		console.log("SEAT: " + seatNames[seatNumber]);
		db.get('SELECT * FROM elections WHERE seat_name = ?', seatNames[seatNumber]).then((result) => {
			var incumbent = result.user_id;
			var msg = electionScript;
			msg = msg.replace("%X", (seatNumbers[seatNumber]).toString());
			var nextElection = moment().startOf('day').add(42,'days').format("L");
			msg = msg.replace("%R", nextElection);
			var electionEnd = moment().startOf('day').add(2, 'days').format("L");
			msg = msg.replace("%E", nextElection);
			var nomineeString = "";
			nomineeString += "👑 = <@" + incumbent.toString() + "> **Incumbent**";
			msg = msg.replace("%N", nomineeString);
			var ballots = client.channels.get("430233443406708746");
			db.run("DELETE FROM nominees");
			ballots.send(msg).then(message => {
				db.run("UPDATE elections SET message_id = ? WHERE seat_name = ?", message.id, seatNames[seatNumber]);
				message.react('👑');
				db.run("INSERT INTO nominees (user_id, emoji_id) VALUES (?, ?)", incumbent, "👑");
				db.run("UPDATE self SET flag = ? WHERE field = ?", 1, "paused");
				db.run("UPDATE self SET flag = ? WHERE field = ?", 1, "election_active");
			});
		}).catch(err => {
			console.trace("PROMISE REJECTION REEEEE.");
		});
	},
	start: false,
	timeZone: 'America/Chicago'
});
startElections.start();

var endElections = new CronJob({
	cronTime: '01 00 12 * * 0',
	onTick: function() {
		var daysSince = Math.abs(exodus.diff(moment().startOf('day'),"days")) % 42;
		var seatNumber = daysSince / 14;
		var ballots = client.channels.get("430233443406708746");
		db.get('SELECT * FROM elections WHERE seat_name = ?', seatNames[seatNumber]).then((result) => {
			var electionMessage = ballots.messages.fetch(result.message_id);
			electionMessage.reactions;
			db.run("UPDATE self SET flag = ? WHERE field = ?", 0, "election_active");
			db.run("UPDATE self SET flag = ? WHERE field = ?", 0, "paused");
		}).catch(err => {
			console.trace("PROMISE REJECTION REEEEE.");
		});
	},
	start: false,
	timeZone: 'America/Chicago'
});
endElections.start();
client.login(AUTH_TOKEN);

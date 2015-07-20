// Requiring our module
var slackAPI = require('slackbotapi');

var config = {};

config.log = false;
config.slackKey = null;

if(process.argv.indexOf("-l") != -1){
    config.log = true;
}

if(process.argv.indexOf("-k") != -1){
    config.slackKey = process.argv[process.argv.indexOf("-k") + 1];;
}

// Starting
var slack = new slackAPI({
    'token': config.slackKey,
    'logging': config.log
});

var snackbarName = 'Cafetaria de Huut';
var priceListUrl = 'http://www.cafetariadehuut.nl/images/prijslijst%202015.pdf';
var orderPhoneNumber = '0314-344828';

var orderData = [];
var lastDay;

function checkDate() {
    var d = new Date();
    var n = d.getDate();

    if (lastDay != n) {
        resetBot();
    }

    lastDay = n;
}

function resetBot() {
    orderData = [];
}

/**
 * Get the current order. If perUser is true, a list of users with their order is send. Otherwise a list with totals
 * is send for easy ordering, together with the name and telephone number of the snack bar.
 *
 * @param perUser When true display a per-user list. Otherwise a list with totals is send.
 * @param data The Slack data.
 */
function getCurrentOrder(perUser, data) {
    var totals = [];
    var userHasOrdered = [];
    var currentOrder = "De volgende bestelling is bij mij bekend: :fries: ```\n";
    var orderFound = false;
    var allUsersHaveOrdered = true;

    for (var userId in orderData) {
        if (typeof orderData[userId] !== 'function') {
            currentOrder += slack.getUser(userId).name + ':  ' + orderData[userId] + "\n";
            orderFound = true;
            userHasOrdered.push(userId);
            if (orderData[userId] in totals) {
                totals[orderData[userId]] += 1;
            } else {
                totals[orderData[userId]] = 1;
            }
        }
    }
    currentOrder += '```';

    var totalsMessage = '@' + slack.getUser(data.user).name + ': ik heb voor vandaag de volgende bestelling genoteerd: :fries: ```' + "\n";
    for (var orderItem in totals) {
        if (typeof totals[orderItem] !== 'function') {
            totalsMessage += totals[orderItem] + "x " + orderItem + "\n";
        }
    }

    var userList = "*Let op:*\n De onderstaande gebruikers hebben nog niets besteld:\n";
    slack.slackData.users.forEach(function (item) {
        var name = item.profile.real_name;
        var id = item.id;

        if (id != slack.slackData.self.id && name != 'slackbot') {
            if (userHasOrdered.indexOf(id) == -1) {
                userList += "  * "+name + "\n";
                allUsersHaveOrdered = false;
            }
        }
    });

    totalsMessage += "```\n" + snackbarName + " is te bereiken via: `" + orderPhoneNumber + "`";

    if (orderFound == true) {
        if (perUser == true) {
            slack.sendMsg(data.channel, currentOrder);
        } else {
            slack.sendMsg(data.channel, totalsMessage);
        }

        if (!allUsersHaveOrdered) {
            slack.sendMsg(data.channel, userList);
        }

    } else {
        slack.sendMsg(data.channel, 'Nog niemand heeft een bestelling geplaatst! :cry: Ben jij de eerste vandaag '+slack.getUser(data.user).profile.first_name+'?');
    }
}

// Slack on EVENT message, send data.
slack.on('message', function (data) {
    // If no text, return.
    if (typeof data.text == 'undefined') return;

    // At every request, check the day to see if the bot data needs a reset.
    checkDate();

    var command = data.text.split(' ');

    // Only if we are mentioned
    if (command[0] == '<@' + slack.slackData.self.id + '>' || command[0] == '<@' + slack.slackData.self.id + '>:') {
        if (command.length == 1) {
            slack.sendMsg(data.channel, 'Zeg het eens @' + slack.getUser(data.user).name + '. Wat kan ik vandaag voor je noteren?');
        } else {
            // Remove the first item (@<botname>) and make it one command again.
            command.shift();
            command = command.join(' ');

            if (command == 'bestellen') {
                getCurrentOrder(false, data);
            } else if (command.indexOf('wie heeft wat') > -1) {
                getCurrentOrder(true, data);
            } else if (command.indexOf('wat hebben ze') > -1) {
                slack.sendMsg(data.channel, '@' + slack.getUser(data.user).name + ': je kunt het complete aanbod van ' + snackbarName + ' vinden op ' + priceListUrl);
            } else if (command == 'reset') {
                if (slack.getUser(data.user).is_admin == true) {
                    resetBot();
                    //slack.sendPM(slack.getUser(data.user), 'De frietbot is weer gereset!');
                    slack.sendMsg(data.channel, 'http://makeameme.org/media/created/aaaand-its-gone-smt2lw.jpg');
                } else {
                    slack.sendMsg(data.channel, ':troll:');
                }
            } else {
                if (data.user in orderData) {
                    slack.sendMsg(data.channel, '@' + slack.getUser(data.user).name + ': ik had al een bestelling van je! Deze heb ik nu overschreven met een `' + command + '`.');
                } else {
                    slack.sendMsg(data.channel, '@' + slack.getUser(data.user).name + ': een `' + command + '` is voor je genoteerd.');
                }

                orderData[data.user] = command;
            }
        }
    }
});

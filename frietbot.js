// Requiring our module
var slackAPI = require('slackbotapi');

var config = {};

config.log = false;
config.slackKey = null;

if(process.argv.indexOf("-l") != -1){
    config.log = true;
}

if(process.argv.indexOf("-k") != -1){
    config.slackKey = process.argv[process.argv.indexOf("-k") + 1];
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
var date = new Date();

/**
 * Check the date. If today isn't the day saved in 'lastDay', reset the bot data.
 */
function checkDate() {
    // Update the date
    date = new Date();
    if (date.getDate() != lastDay) {
        resetBot();
    }

    lastDay = date.getDate();
}

/**
 * Reset the bot data.
 */
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
    var totalsMessage = '@' + slack.getUser(data.user).name + ': ik heb voor vandaag de volgende bestelling genoteerd: :fries: ```' + "\n";
    var usersWithoutOrders = "*Let op:*\n De onderstaande gebruikers hebben nog niets besteld:\n";

    var orderFound = false;
    var allUsersHaveOrdered = true;

    /*
     * Loop through all the users, check if there are orders and count the totals. Also, add the users and what they've
     * order to the 'currentOrder' var so we can give it back if required.
     */
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

    // Loop through all of the order items to add them to the 'totalsMessage' so we can give it back when required.
    for (var orderItem in totals) {
        if (typeof totals[orderItem] !== 'function') {
            totalsMessage += totals[orderItem] + "x " + orderItem + "\n";
        }
    }

    /*
     * Loop through all of the Slack users to see if they've ordered something. If they haven't, add the name to the
     * 'usersWithoutOrders' list
     */
    slack.slackData.users.forEach(function (item) {
        var name = item.profile.real_name;
        var id = item.id;

        if (id != slack.slackData.self.id && name != null && name != 'slackbot') {
            if (userHasOrdered.indexOf(id) == -1) {
                usersWithoutOrders += "  * "+name + "\n";
                allUsersHaveOrdered = false;
            }
        }
    });

    // Add the snack bar name and phone number to the totals message.
    totalsMessage += "```\n" + snackbarName + " is te bereiken via: `" + orderPhoneNumber + "`";

    // If there are some orders found, check if we want to give it back listed per-user or a total (for easy ordering)
    if (orderFound == true) {
        if (perUser == true) {
            sendMessage(data, currentOrder);
        } else {
            sendMessage(data, totalsMessage);
        }

        // Show a warning when not all users have placed an order.
        if (!allUsersHaveOrdered) {
            sendMessage(data, usersWithoutOrders);
        }

    // If nobody has placed an order yet, be sad and cry.
    } else {
        sendMessage(data, 'Nog niemand heeft een bestelling geplaatst! :cry: Ben jij de eerste vandaag ' + slack.getUser(data.user).profile.first_name + '?');
    }
}

function sendUsageInfo(data)
{
    reply(data, 'Ik snap de volgende shit:\nbestellen\nwie heeft wat?\nwat hebben ze?\n-je bestelling-\nreset' );
}

function reply(data, reply)
{
    var message = '@' + slack.getUser(data.user).name + ': ' + reply;
    sendMessage(data, message);
}

function sendMessage(data, message)
{
    slack.sendMsg(data.channel, message);
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
            sendMessage(data, 'Zeg het eens @' + slack.getUser(data.user).name + '. Wat kan ik vandaag voor je noteren?');
        } else {
            // Remove the first item (@<botname>) and make it one command again.
            command.shift();
            command = command.join(' ');

            if (command == 'bestellen') {
                getCurrentOrder(false, data);

            } else if (command.indexOf('wie heeft wat') > -1) {
                getCurrentOrder(true, data);

            } else if (command.indexOf('wat hebben ze') > -1) {
                reply(data, 'je kunt het complete aanbod van ' + snackbarName + ' vinden op ' + priceListUrl);

            } else if (command == 'reset') {
                // Only a team admin can reset the bot. All other users receive a troll.
                if (slack.getUser(data.user).is_admin == true) {
                    resetBot();
                    sendMessage(data, 'http://makeameme.org/media/created/aaaand-its-gone-smt2lw.jpg');
                } else {
                    reply(data, ':troll:');
                }

            } else if (command.indexOf('help') > -1 || command.indexOf('usage') > -1) {
                sendUsageInfo(data);

            // If no command is specified, assume it is an order.
            } else {
                // Return another message if this user has already ordered something, before overwrite it.
                if (data.user in orderData) {
                    reply(data, 'ik had al een bestelling van je! Deze heb ik nu overschreven met een `' + command + '`.');
                } else {
                    reply(data, 'een `' + command + '` is voor je genoteerd.');

                    // Warn the user (just one time) if today isn't a friday.
                    if (date.getDay() != 5) {
                        reply(data, 'je weet wel dat het geen vrijdag is? :see_no_evil:');
                    }
                }

                // (Over)write the order for this user.
                orderData[data.user] = command;
            }
        }
    }
});

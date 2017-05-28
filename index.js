'use strict';

var _ = require('underscore'),
    Imap = require('imap'),
    inspect = require('util').inspect,
    fs = require('fs');

const accounts = require('./accounts');

Array.prototype.pop = function () {
    if (!this.length) return null;
    var top = this[0];
    this.splice(0, 1);
    return top;
};

var config = [];
for (var keyHost in accounts) {
    if (!accounts.hasOwnProperty(keyHost)) continue;
    var host = accounts[keyHost];
    for (var keyAccount in host.users) {
        if (!host.users.hasOwnProperty(keyAccount)) continue;
        config.push(_.extend(_.omit(host, 'users'), host.users[keyAccount]));
    }
}

if (!config.length) exit;

var imap = new Imap(config.pop());

function openInbox(cb) {
    imap.openBox('INBOX', true, cb);
}

var results = [];

imap.once('ready', function() {
    openInbox(function(err, box) {
        var _result = {
            user: imap._config.user,
            messages: []
        };
        if (err) throw err;
        imap.seq.search(['ALL'], function (err, result) {
            console.log('[' + _result.user + '] Find ' + result.lenght + ' Messages.');
            var f = imap.seq.fetch(_.map(result, function (num) { return num.toString(); }), {
                bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE)',
                struct: true
            });
            f.on('message', function(msg, seqno) {
                console.log('[' + _result.user + '] Requesting Message #%d', seqno);
                var prefix = '(#' + seqno + ') ';
                msg.on('body', function(stream, info) {
                    var buffer = '';
                    stream.on('data', function(chunk) {
                        buffer += chunk.toString('utf8');
                    });
                    stream.once('end', function() {
                        _result.messages.push(Imap.parseHeader(buffer));
                    });
                });
                msg.once('end', function() {
                    console.log('[' + _result.user + '] ' + prefix + 'Finished');
                });
            });
            f.once('error', function(err) {
              console.log('Fetch error: ' + err);
            });
            f.once('end', function() {
                console.log('[' + _result.user + '] Done fetching all messages!');
                results.push(_result);
                imap.end();
            });
        });
    });
});

imap.once('end', function() {
    console.log('Connection ended');

    if (config.length) {
        // imap = new Imap(config.pop());
        console.log(imap._config);
        // imap.connect();
    } else {
        var keys = _.keys(results[0].messages[0]);
        var stringify = keys.join(',');
        for (var keyHost in results) {
            if (!results.hasOwnProperty(keyHost)) continue;
            for (var keyMessage in results[keyHost].messages) {
                if (!results[keyHost].messages.hasOwnProperty(keyMessage)) continue;
                stringify += '\n' + _.values(_.pick(results[keyHost].messages[keyMessage], keys)).join(',');
            }
        }
        fs.writeFile('result.csv', stringify, 'utf8', function(err) {
            if(err) {
                return console.log(err);
            }
            console.log("The file was saved!");
        });
    }
});

imap.connect();

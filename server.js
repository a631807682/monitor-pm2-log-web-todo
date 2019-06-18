const http = require('http');
const IO = require('socket.io');
const fs = require('fs');
const pm2 = require('pm2-promise');
const spawn = require('child_process').spawn;

function tail(filePath) {
    return spawn("tail", ["-f", filePath]);
}

// -- Node.js Server ----------------------------------------------------------

server = http.createServer(function(req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    fs.readFile(__dirname + '/index.html', function(err, data) {
        res.write(data, 'utf8');
        res.end();
    });
})
server.listen(8000, '0.0.0.0');

// -- Setup Socket.IO ---------------------------------------------------------

const io = IO(server, {
    path: '/backend/io'
});

io.on('connection', async (client) => {

    client.on('message', async (message) => {
        console.log('IO [Recive]:', message.event, JSON.stringify(message));
        if (message.event === 'pm2-list') {
            getPM2ListHandle(message);
        } else if (message.event === 'monitor-pm2-log') {
            monitorPM2LogHandle(message);
        }
    })

    async function getPM2ListHandle(message) {
        let processList = await pm2.list();
        processList = processList.map(p => {
            p.pm2_env = undefined;
            return p;
        })
        client.send({ event: 'pm2-list', data: processList });
    }

    async function monitorPM2LogHandle(message) {
        let processList = await pm2.list();
        let p = processList.find(p => p.name === message.name);
        if (p) {
            let filePath = p.pm2_env.pm_out_log_path;
            if (client.__logWatcher) {
                await unmonitorPM2LogHandle();
            }

            client.__logWatcher = tail(filePath);
            client.__logWatcher.stdout.on('data', function(data) {
                client.send({ event: 'pm2-log', data: data.toString('utf-8') })
            });
        }
    }

    async function unmonitorPM2LogHandle() {
        if (client.__logWatcher) {
            client.__logWatcher.stdin.pause();
            client.__logWatcher.kill();
        }
    }
});

console.log('Server running at http://0.0.0.0:8000/, connect with a browser to see pm2 log');
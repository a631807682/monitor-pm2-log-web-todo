const http = require('http');
const IO = require('socket.io');
const fs = require('fs');
const pm2 = require('pm2-promise');
const spawn = require('child_process').spawn;

function tail(filePath) {
    return spawn("tail", ["-f", "-n0", filePath]);
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

let clients = [];

/*
    [{
        path:'filepath',
        spawn:null,
        clients:[]
    }]
 */
let processes = [];

io.on('connection', async (client) => {
    clients.push(client);

    client.on('message', async (message) => {
        console.log('IO [Recive]:', message.event, JSON.stringify(message));
        if (message.event === 'pm2-list') {
            getPM2ListHandle(client, message);
        } else if (message.event === 'monitor-pm2-log') {
            monitorPM2LogHandle(client, message);
        }
    })

    client.on('disconnect', () => {
        clearSpawns(client);

        let sIndex = clients.findIndex(c => c === client);
        if (sIndex > -1) {
            clients.splice(sIndex, 1);
        }
    })

    async function getPM2ListHandle(client, message) {
        let processList = await pm2.list();
        processList = processList.map(p => {
            p.pm2_env = undefined;
            return p;
        })
        client.send({ event: 'pm2-list', data: processList });
    }

    async function monitorPM2LogHandle(client, message) {
        let processList = await pm2.list();
        let p = processList.find(p => p.name === message.name);
        if (p) {
            let filePath = p.pm2_env.pm_out_log_path;

            clearSpawns(client);
            appendSpan(client, filePath);
        }
    }

    function clearSpawns(client) {
        for (let p of processes) {
            p.clients = p.clients.filter(c => c !== client);
            if (p.clients.length === 0 && p.spawn) {
                p.spawn.stdin.pause();
                p.spawn.kill();
                p.spawn = null;
            }
        }
    }

    function appendSpan(client, filePath) {
        let p = processes.find(p => p.path === filePath);
        if (!p) {
            p = {
                path: filePath,
                clients: [client],
                spawn: null
            }
            processes.push(p);
        } else {
            p.clients.push(client);
        }

        if (!p.spawn) {
            p.spawn = tail(filePath);
            p.spawn.stdout.on('data', send2Clinets);
        }

        function send2Clinets(data) {
            // console.log('clinets count', p.clients.length)
            for (let c of p.clients) {
                c.send({ event: 'pm2-log', data: data.toString('utf-8') })
            }
        }
    }
});

console.log('Server running at http://0.0.0.0:8000/, connect with a browser to see pm2 log');
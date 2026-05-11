const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);

const hostname = 'coflix.date';

dns.resolve4(hostname, (err, addresses) => {
    console.log('Resolve4:', { err, addresses });
    dns.resolve6(hostname, (err6, addresses6) => {
        console.log('Resolve6:', { err6, addresses6 });
        dns.lookup(hostname, (errL, address, family) => {
            console.log('Lookup:', { errL, address, family });
        });
    });
});

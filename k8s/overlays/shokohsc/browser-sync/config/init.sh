#!/bin/sh

sed -i 's/var port = options/var port = socketOpts.port || options/g' /usr/local/lib/node_modules/browser-sync/dist/connect-utils.js
sed -i 's/listenHost || url.parse(bsUrls.external).hostname/url.parse(bsUrls.external).hostname || listenHost/g' /usr/local/lib/node_modules/browser-sync/node_modules/browser-sync-ui/lib/async.js

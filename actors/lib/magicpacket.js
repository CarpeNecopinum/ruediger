'use strict'

/*
This software is released under the terms of the MIT License.

(c) 2016 Taka Kojima (the "Author").
All Rights Reserved.

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

Distributions of all or part of the Software intended to be used
by the recipients as they would use the unmodified Software,
containing modifications that substantially alter, remove, or
disable functionality of the Software, outside of the documented
configuration mechanisms provided by the Software, shall be
modified such that the Author's bug reporting email addresses and
urls are either replaced with the contact information of the
parties responsible for the changes, or removed entirely.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

Except where noted, this license applies to any and all software
programs and associated documentation files created by the
Author, when distributed with the Software.
*/


const os = require('os')
const net = require('net')
const dgram = require('dgram')

let createWOLPacket = (mac, byte) => {
  mac = mac.replace(/:/g, '')
  if (mac.length !== 12 || mac.match(/[^a-fA-F0-9]/)) throw new Error(`Invalid MAC address: ${mac}`)
  return Buffer.from(byte.repeat(6) + mac.repeat(16), 'hex')
}

let getBroadcastAddr = (ip, netmask) => {
  let a = ip.split('.').map(s => parseInt(s, 10))
  let b = netmask.split('.').map(s => parseInt(s, 10))
  let c = []
  for (let i = 0; i < a.length; i++) c.push((a[i] & b[i]) | (b[i] ^ 255))
  return c.join('.')
}

let sendToAll = (mac, opts) => {
  let promises = []
  let ifaces = os.networkInterfaces()
  for (let p in ifaces) {
    ifaces[p].forEach(iface => {
      if (iface.internal || !net.isIPv4(iface.address)) return
      let ifaceOpts = Object.assign({}, opts)
      ifaceOpts.from = iface.address
      ifaceOpts.address = getBroadcastAddr(iface.address, iface.netmask)
      promises.push(send(mac, ifaceOpts))
    })
  }
  return Promise.all(promises)
}

let send = (mac, opts = {}) => {
  if (!opts.from) return sendToAll(mac, opts)

  return new Promise((resolve, reject) => {
    try {
      let from = opts.from
      let port = opts.port || 9
      let count = opts.count || 3
      let address = opts.address || '255.255.255.255'
      let interval = opts.interval || 100
      let byte = opts.byte || 'ff'
      let intervalId

      console.log(`Sending MagicPacket ${byte} to ${mac}`)
      let pkt = createWOLPacket(mac, byte)

      let done = err => {
        count--
        if (!count || err) {
          socket.close()
          clearInterval(intervalId)
          if (err) return reject(err)
          return resolve()
        }
      }

      let doSend = () => {
        socket.send(pkt, 0, pkt.length, port, address, done)
      }

      let socket = dgram.createSocket(net.isIPv6(address) ? 'udp6' : 'udp4')
      socket.unref()

      socket.bind(0, from, err => {
        if (err) return reject(err)
        socket.setBroadcast(true)
        socket.once('error', done)
        doSend()
        intervalId = setInterval(doSend, interval)
      })
    } catch (err) {
      return reject(err)
    }
  })
}

module.exports = send

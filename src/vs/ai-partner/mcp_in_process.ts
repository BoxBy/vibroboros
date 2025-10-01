import { Duplex } from 'stream';

/**
 * Creates a pair of in-memory, interconnected Duplex streams.
 * This allows for creating a client and server that communicate directly in the same process
 * without any actual I/O, simulating a network connection.
 * It's ideal for testing or for tightly-coupled components that should still
 * adhere to a client/server protocol.
 */
export function createInProcessStreamPair(): [Duplex, Duplex] {
    const stream1 = new Duplex({
        write(chunk, encoding, callback) {
            if (stream2.push(chunk)) {
                callback();
            } else {
                stream2.once('drain', callback);
            }
        },
        read() { },
    });

    const stream2 = new Duplex({
        write(chunk, encoding, callback) {
            if (stream1.push(chunk)) {
                callback();
            } else {
                stream1.once('drain', callback);
            }
        },
        read() { },
    });

    stream1.on('finish', () => {
        stream2.push(null);
    });

    stream2.on('finish', () => {
        stream1.push(null);
    });

    return [stream1, stream2];
}

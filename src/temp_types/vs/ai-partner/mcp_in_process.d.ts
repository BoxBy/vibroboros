import { Duplex } from 'stream';
/**
 * Creates a pair of in-memory, interconnected Duplex streams.
 * This allows for creating a client and server that communicate directly in the same process
 * without any actual I/O, simulating a network connection.
 * It's ideal for testing or for tightly-coupled components that should still
 * adhere to a client/server protocol.
 */
export declare function createInProcessStreamPair(): [Duplex, Duplex];

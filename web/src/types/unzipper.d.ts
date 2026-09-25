/** Narrow surface used by the bounded, in-memory Office image reader. */
declare module "unzipper" {
  export const Open: {
    buffer(bytes: Buffer): Promise<{
      files: Array<{
        path: string;
        uncompressedSize: number;
        stream(): import("node:stream").Readable;
      }>;
    }>;
  };
}

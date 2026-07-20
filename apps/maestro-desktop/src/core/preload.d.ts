export {};

declare global {
  interface Window {
    viveroFoundation?: {
      getRuntimeStatus: () => string;
      openExternalUrl: (url: string) => Promise<boolean>;
    };
  }
}

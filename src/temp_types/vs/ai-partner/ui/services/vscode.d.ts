import { A2AMessage } from "../../interfaces/A2AMessage";
/**
 * UI에서 VSCode Extension 백엔드로 메시지를 보냅니다.
 * A2AMessage 타입 외에 일반 객체도 보낼 수 있도록 타입을 확장했습니다.
 */
declare function postMessage<T>(message: A2AMessage<T> | {
    command: string;
    [key: string]: any;
}): void;
declare function getState<T = any>(): T | undefined;
declare function setState<T = any>(state: T): void;
export declare const vscodeService: {
    postMessage: typeof postMessage;
    getState: typeof getState;
    setState: typeof setState;
};
export {};

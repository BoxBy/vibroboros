import { A2AMessage } from "../../interfaces/A2AMessage";

type VsCodeApi = {
	postMessage(message: any): void;
	getState(): any;
	setState(newState: any): void;
};

// vscode 객체를 한 번만 초기화하기 위한 변수
let vscode: VsCodeApi | undefined;

function getVsCodeApi(): VsCodeApi | undefined {
	if (typeof acquireVsCodeApi === 'function') {
		if (!vscode) {
			// @ts-ignore
			vscode = acquireVsCodeApi();
		}
		return vscode;
	}
	// acquireVsCodeApi 함수가 없는 환경(예: 웹 브라우저)에서는 undefined를 반환
	return undefined;
}

/**
 * UI에서 VSCode Extension 백엔드로 메시지를 보냅니다.
 * A2AMessage 타입 외에 일반 객체도 보낼 수 있도록 타입을 확장했습니다.
 */
function postMessage<T>(message: A2AMessage<T> | { command: string, [key: string]: any }) {
	const api = getVsCodeApi();
	if (api) {
		api.postMessage(message);
	} else {
		// API를 사용할 수 없을 때 콘솔에 로그를 남겨 디버깅을 돕습니다.
		console.log('VSCode API not found. Message not sent:', message);
	}
}

function getState<T = any>(): T | undefined {
	const api = getVsCodeApi();
	return api?.getState();
}

function setState<T = any>(state: T): void {
	const api = getVsCodeApi();
	api?.setState(state);
}

// MainView에서 사용할 수 있도록 vscodeService 객체로 묶어서 내보냅니다.
export const vscodeService = {
	postMessage,
	getState,
	setState,
};
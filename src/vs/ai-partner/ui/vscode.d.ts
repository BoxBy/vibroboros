declare global {
	/**
	 * VSCode Webview 환경에서 제공되는 API 객체를 가져옵니다.
	 * 이 함수는 웹뷰 스크립트에서 한 번만 호출해야 합니다.
	 */
	const acquireVsCodeApi: () => {
		/**
		 * 웹뷰에서 확장 프로그램 백엔드로 메시지를 보냅니다.
		 * @param message 보낼 메시지 데이터
		 */
		postMessage(message: any): void;

		/**
		 * 웹뷰의 현재 상태를 가져옵니다.
		 * @returns 이전에 저장된 상태 객체
		 */
		getState(): any;

		/**
		 * 웹뷰의 상태를 저장합니다. 이 상태는 웹뷰가 다시 활성화될 때 유지됩니다.
		 * @param newState 저장할 새로운 상태 객체
		 */
		setState(newState: any): void;
	};
}

// 이 파일이 모듈임을 TypeScript에게 알려주기 위해 빈 export를 추가합니다.
export {};
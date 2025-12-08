/**
 * Message Handler Registry
 * 
 * Following SDK pattern (similar to toolRegistry in MCPServer.ts)
 * This file contains message handlers for MainView component.
 */

import React from 'react';
import { DisplayMessage, PlanStep } from './MainView';

export type MessageHandler = (payload: any, context: HandlerContext) => void;

export interface HandlerContext {
	setSlashCommands: (commands: { command: string; description: string }[]) => void;
	setCurrentProvider: (provider: 'openai' | 'ollama' | 'anthropic' | 'xai' | 'google' | 'groq' | 'openrouter' | undefined) => void;
	setCurrentModel: (model: string | undefined) => void;
	setAvailableModels: (models: string[]) => void;
	setProfiles: (profiles: Array<{ id: string; name: string; provider?: string; endpoint?: string; model?: string }>) => void;
	setActiveProfileId: (id: string | null) => void;
	setSessions: (sessions: any[]) => void;
	setActiveSessionId: (id: string) => void;
	setMessages: React.Dispatch<React.SetStateAction<DisplayMessage[]>>;
	setPlan: React.Dispatch<React.SetStateAction<PlanStep[]>>;
	setStatusText: (text: string | null) => void;
	setIsThinking: (thinking: boolean) => void;
	setPendingDiffs: React.Dispatch<React.SetStateAction<any[]>>;
	setShowDiffSummary: (show: boolean) => void;
	setUroborosProposal: React.Dispatch<React.SetStateAction<{
		userText: string;
		complexityScore: number;
		expectedSteps: number;
		affectedScope: string;
		complexityReasons: string[];
	} | null>>;
	mapHistoryToDisplayMessages: (history: any[]) => DisplayMessage[];
	welcomeLockRef: React.MutableRefObject<boolean>;
	viewRef: React.MutableRefObject<'welcome' | 'chat' | 'settings'>;
	dropIncomingRef: React.MutableRefObject<boolean>;
	lastUserAttachmentsRef: React.MutableRefObject<any[]>;
	vscodeService: any;
}

/**
 * Creates message handler registry following SDK pattern (similar to toolRegistry in MCPServer)
 */
export function createMessageHandlerRegistry(context: HandlerContext): Record<string, MessageHandler> {
	return {
		slashCommandsResponse: (payload) => {
			context.setSlashCommands(payload || []);
		},
		llmSettingsResponse: (payload) => {
			if (payload) {
				if (typeof payload.llmProvider === 'string') {
					context.setCurrentProvider(payload.llmProvider);
				}
				if (typeof payload.model === 'string') {
					context.setCurrentModel(payload.model);
				}
			}
		},
		updateModels: (payload) => {
			if (Array.isArray(payload)) {
				context.setAvailableModels(payload);
			}
		},
		modelChanged: (payload) => {
			if (typeof payload === 'string') {
				context.setCurrentModel(payload);
			}
		},
		profilesResponse: (payload) => {
			if (payload) {
				context.setProfiles(payload.profiles || []);
				context.setActiveProfileId(typeof payload.activeProfileId === 'string' ? payload.activeProfileId : null);
			}
		},
		historyList: (payload) => {
			if (payload) {
				const { sessions: sess, activeId } = payload;
				if (Array.isArray(sess)) context.setSessions(sess);
				if (typeof activeId === 'string') context.setActiveSessionId(activeId);
			}
		},
		loadHistory: (payload) => {
			// While on Welcome, ignore history loads to prevent flicker and keep recent list visible
			if (context.welcomeLockRef.current && context.viewRef.current === 'welcome') {
				return;
			}
			// Avoid overriding in-flight streaming bubble right after user sends a message
			if (context.dropIncomingRef.current) {
				context.dropIncomingRef.current = false;
				return;
			}
			try {
				context.vscodeService.postMessage({
					command: 'debugLog',
					payload: {
						source: 'UI',
						event: 'loadHistory received',
						meta: { count: Array.isArray(payload) ? payload.length : 0 }
					}
				});
			} catch {}
			
			// Merge strategy: preserve existing messages (especially codeEditFile) and merge with history
			const mapped = context.mapHistoryToDisplayMessages(payload || []);
			context.setMessages(prev => {
				// Create a map of existing messages by unique key
				const existingMap = new Map<string, DisplayMessage>();
				prev.forEach(msg => {
                    // Prioritize messageId
                    if (msg.messageId) {
                        existingMap.set(`id:${msg.messageId}`, msg);
                    }
					// For codeEditFile, use filePath as key
					else if (msg.kind === 'codeEditFile' && msg.filePath) {
						existingMap.set(`codeEditFile:${msg.filePath}`, msg);
					} else {
						// For other messages, use timestamp + sender + text prefix as key
						const key = `${msg.timestamp || ''}:${msg.sender}:${(msg.text || '').slice(0, 50)}`;
						if (key && !existingMap.has(key)) {
							existingMap.set(key, msg);
						}
					}
				});

				// Merge new messages from history
				const merged: DisplayMessage[] = [];
				const seenKeys = new Set<string>();

				// First, add all existing messages that are not in history (preserve UI-only messages)
				prev.forEach(msg => {
                    if (msg.messageId) {
                        const key = `id:${msg.messageId}`;
                        // Check if exists in history by ID
                        const existsInHistory = mapped.some(m => m.messageId === msg.messageId);
                        if (!existsInHistory && !seenKeys.has(key)) {
                            merged.push(msg);
                            seenKeys.add(key);
                        }
                    } else if (msg.kind === 'codeEditFile' && msg.filePath) {
						const key = `codeEditFile:${msg.filePath}`;
						// Check if this filePath exists in mapped history
						const existsInHistory = mapped.some(m => m.kind === 'codeEditFile' && m.filePath === msg.filePath);
						if (!existsInHistory && !seenKeys.has(key)) {
							merged.push(msg);
							seenKeys.add(key);
						}
					} else {
						const key = `${msg.timestamp || ''}:${msg.sender}:${(msg.text || '').slice(0, 50)}`;
						if (key && !seenKeys.has(key)) {
							// Check if similar message exists in history
							const existsInHistory = mapped.some(m => 
								m.sender === msg.sender && 
								(m.text || '').slice(0, 50) === (msg.text || '').slice(0, 50) &&
								// For user messages, ignore timestamp mismatch (optimistic vs backend)
								(msg.sender === 'user' || m.timestamp === msg.timestamp)
							);
							if (!existsInHistory) {
								merged.push(msg);
								seenKeys.add(key);
							}
						}
					}
				});

				// Then, add/update messages from history
				mapped.forEach(msg => {
                    if (msg.messageId) {
                        const key = `id:${msg.messageId}`;
                        if (!seenKeys.has(key)) {
                            merged.push(msg);
                            seenKeys.add(key);
                        } else {
                            // Update existing message
                            const index = merged.findIndex(m => m.messageId === msg.messageId);
                            if (index >= 0) {
                                merged[index] = msg;
                            }
                        }
                    } else if (msg.kind === 'codeEditFile' && msg.filePath) {
						const key = `codeEditFile:${msg.filePath}`;
						if (!seenKeys.has(key)) {
							merged.push(msg);
							seenKeys.add(key);
						} else {
							// Update existing message
							const index = merged.findIndex(m => m.kind === 'codeEditFile' && m.filePath === msg.filePath);
							if (index >= 0) {
								merged[index] = msg;
							}
						}
					} else {
						const key = `${msg.timestamp || ''}:${msg.sender}:${(msg.text || '').slice(0, 50)}`;
						if (key && !seenKeys.has(key)) {
							merged.push(msg);
							seenKeys.add(key);
						} else {
							// Update existing message
							const index = merged.findIndex(m => 
								m.timestamp === msg.timestamp && 
								m.sender === msg.sender && 
								(m.text || '').slice(0, 50) === (msg.text || '').slice(0, 50)
							);
							if (index >= 0) {
								merged[index] = msg;
							}
						}
					}
				});

				// Sort by timestamp to maintain chronological order
				merged.sort((a, b) => {
					const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
					const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
					return timeA - timeB;
				});

				return merged;
			});
		},
		activeProfileChanged: (payload) => {
			context.setActiveProfileId(typeof payload === 'string' ? payload : null);
		},
		thinking: () => {
			// Keep plan visible; do not clear here
			context.setMessages(prev => [
				...prev,
				{
					sender: 'ai',
					text: '',
					attachments: context.lastUserAttachmentsRef.current && context.lastUserAttachmentsRef.current.length
						? [...context.lastUserAttachmentsRef.current]
						: undefined
				}
			]);
			context.setIsThinking(true);
		},
		responseChunk: (payload) => {
			context.setMessages(prev => {
				if (prev.length === 0 || prev[prev.length - 1].sender !== 'ai') {
					return [...prev, { sender: 'ai', text: payload.text }];
				}
				const newMessages = [...prev];
				const lastMessage = { ...newMessages[newMessages.length - 1] };
				lastMessage.text += payload.text;
				newMessages[newMessages.length - 1] = lastMessage;
				return newMessages;
			});
		},
		responseEnd: (payload) => {
			context.setStatusText(null);
			context.setIsThinking(false);
			context.setMessages(prev => {
				if (prev.length === 0 || prev[prev.length - 1].sender !== 'ai') return prev;
				const newMessages = [...prev];
				const lastMessage = { ...newMessages[newMessages.length - 1] };
				if (payload.thought) {
					lastMessage.thought = payload.thought;
				}
				if (!lastMessage.attachments || lastMessage.attachments.length === 0) {
					if (context.lastUserAttachmentsRef.current && context.lastUserAttachmentsRef.current.length) {
						lastMessage.attachments = [...context.lastUserAttachmentsRef.current];
					}
				}
				newMessages[newMessages.length - 1] = lastMessage;
				return newMessages;
			});
			// Clear after attaching to AI message
			context.lastUserAttachmentsRef.current = [];
		},
		response: (payload) => {
			// Allow subsequent loadHistory updates
			context.dropIncomingRef.current = false;
			context.setStatusText(null);
			if (!payload?.keepThinking) {
				context.setIsThinking(false);
			}
			if (payload) {
				context.setMessages(prev => [
					...prev,
					{
						sender: 'ai',
						text: payload.text,
						thought: payload.thought,
						senderName: payload.senderName,
						timestamp: payload.timestamp,
						requiresUserInput: payload.requiresUserInput,
						attachments:
							context.lastUserAttachmentsRef.current && context.lastUserAttachmentsRef.current.length
								? [...context.lastUserAttachmentsRef.current]
								: undefined,
						filePath: payload.filePath,
						title: payload.title,
						suggestionType: payload.suggestionType
					} as any
				]);
			}
		},
		analysis: (payload) => {
			context.setIsThinking(true);
			if (payload && typeof payload.text === 'string') {
				context.setMessages(prev => [
					...prev,
					{
						sender: 'ai',
						text: payload.text,
						kind: 'task',
						senderName: payload.senderName,
						timestamp: payload.timestamp
					} as any
				]);
			}
		},
		progressLog: (payload) => {
			if (payload && payload.text) {
				// Progress log는 bubble 없이만 표시되도록 kind: 'progress'로 설정
				// 중복 방지: 마지막 메시지가 progress가 아니거나 text가 다른 경우에만 추가
				context.setMessages(prev => {
					const lastMsg = prev[prev.length - 1];
					// 마지막 메시지가 progress이고 같은 텍스트면 중복 추가하지 않음
					if (lastMsg && lastMsg.kind === 'progress' && lastMsg.text === payload.text) {
						return prev;
					}
					// 마지막 메시지가 AI bubble이면 progress를 별도로 추가
					return [
						...prev,
						{
							sender: 'ai',
							text: payload.text,
							kind: 'progress',
							timestamp: new Date().toISOString()
						} as any
					];
				});
			}
		},
		progressLogChunk: (payload) => {
			if (payload && payload.text) {
				context.setMessages(prev => {
					const lastMsg = prev[prev.length - 1];
					if (lastMsg && lastMsg.kind === 'progress') {
						// Append to existing progress log
						const newMessages = [...prev];
						const updatedMsg = { ...lastMsg, text: lastMsg.text + payload.text };
						newMessages[newMessages.length - 1] = updatedMsg;
						return newMessages;
					} else {
						// Create new progress log if last message is not progress
						return [
							...prev,
							{
								sender: 'ai',
								text: payload.text,
								kind: 'progress',
								timestamp: new Date().toISOString()
							} as any
						];
					}
				});
			}
		},
		lintSummary: (payload) => {
			if (payload && typeof payload.filePath === 'string' && typeof payload.summary === 'string') {
				const fp = payload.filePath;
				const summary = payload.summary;
				context.setMessages(prev =>
					prev.map(m => {
						if (m.kind === 'codeEditFile' && m.filePath === fp) {
							return { ...m, lintSummary: summary } as any;
						}
						return m;
					})
				);
			}
		},
		updatePlanStep: (payload) => {
			context.setPlan(prevPlan => {
				const newPlan = [...prevPlan];
				const { index, status } = payload;
				if (newPlan[index]) {
					newPlan[index].status = status;
				}
				return newPlan;
			});
		},
		statusUpdate: (payload) => {
			context.setStatusText(payload.text);
		},
		addDiff: (payload) => {
			// 파일이 이미 생성되었으므로 diff list에만 추가
			if (payload) {
				context.setPendingDiffs(prev => {
					const exists = prev.some(d => d.filePath === payload.filePath);
					const next = exists
						? prev.map(d => (d.filePath === payload.filePath ? { ...d, ...payload } : d))
						: [...prev, payload];
					return next;
				});
				// Diff list를 자동으로 펼치지 않음 (사용자 피드백 반영)
				context.setShowDiffSummary(false);
			}
		},
		createFileCard: (payload) => {
			// Create New File 카드 표시
			// DO NOT call setStatusText or setIsThinking here - it may interfere with ongoing operations
			if (payload) {
				context.setMessages(prev => {
					// Removed aggressive deduplication: We want to show sequence of edits/creations
					// unique messageId handles react key uniqueness

					return [
						...prev,
						{
							sender: 'ai',
							text: '',
							thought: undefined,
							senderName: payload.senderName,
							timestamp: payload.timestamp || new Date().toISOString(),
							kind: 'codeEditFile',
							filePath: payload.filePath,
							relativePath: payload.relativePath || payload.filePath,
							title: payload.title,
							suggestionType: payload.suggestionType,
							lintSummary: payload.lintSummary,
							diff: undefined
						} as any
					];
				});
			}
		},
		displayDiffInChatBubble: (payload) => {
			// 채팅 버블에는 diff 대신 "수정된 파일" 정보만 간단히 표시하고,
			// 실제 diff/승인 흐름은 상단 요약 바(pendingDiffs)에서 관리한다.
			context.setStatusText(null);
			// Keep plan during diff prompts
			context.setIsThinking(false);
			if (payload) {
				try {
					context.vscodeService.postMessage({
						command: 'debugLog',
						payload: {
							source: 'UI',
							event: 'displayDiffInChatBubble received',
							meta: {
								filePath: payload.filePath,
								title: payload.title,
								suggestionType: payload.suggestionType
							}
						}
					});
				} catch {}
				context.setPendingDiffs(prev => {
					const exists = prev.some(d => d.filePath === payload.filePath);
					const next = exists
						? prev.map(d => (d.filePath === payload.filePath ? { ...d, ...payload } : d))
						: [...prev, payload];
					return next;
				});
				// 기본은 닫힘 상태 유지
				context.setShowDiffSummary(false);
				// 채팅 메시지 스트림에는 CodeEditAgent 파일 수정 제안을 VS Code 스타일 카드로 렌더링하기 위한 메타데이터만 추가한다.
				context.setMessages(prev => {
					// Removed aggressive deduplication

					return [
						...prev,
						{
							sender: 'ai',
							text: '',
							thought: undefined,
							senderName: payload.senderName,
							timestamp: payload.timestamp,
							kind: 'codeEditFile',
							filePath: payload.filePath,
							title: payload.title,
							suggestionType: payload.suggestionType,
							diff: undefined
						} as any
					];
				});
			}
		},
		diffBatchApplied: () => {
			// Accept All 완료 후 요약 초기화
			context.setPendingDiffs([]);
			context.setShowDiffSummary(false);
		},
		focusDiffSummary: () => {
			// No-op
		},
		forceEnable: () => {
			context.setIsThinking(false);
			context.setStatusText(null);
		},
		addUserMessage: (payload) => {
			context.setMessages(prev => {
				const nextMsg = {
					...payload,
					senderName: 'User',
					timestamp: new Date().toISOString(),
					attachments: payload.attachments
				} as any;
				
                // Check if this message already exists in the list (by ID or content)
                const alreadyExists = prev.some(m => 
                    (nextMsg.messageId && m.messageId === nextMsg.messageId) ||
                    (m.sender === 'user' && 
                     m.text === nextMsg.text && 
                     JSON.stringify(m.attachments || []) === JSON.stringify(nextMsg.attachments || []))
                );

				if (alreadyExists) return prev;
				return [...prev, nextMsg];
			});
			try {
				context.lastUserAttachmentsRef.current = Array.isArray(payload?.attachments)
					? [...payload.attachments]
					: [];
			} catch {}
		},
		hideDiff: (payload) => {
			if (payload && payload.filepath) {
				context.setMessages(prev =>
					prev.map(msg => {
						if (msg.diff && msg.diff.filePath === payload.filepath) {
							return { ...msg, diff: undefined };
						}
						return msg;
					})
				);
			}
		},
		hidePlanButtons: () => {
			context.setPlan([]);
		},
		displayPlan: (payload) => {
			if (payload && payload.plan) {
				context.setPlan(payload.plan);
			}
		},
		proposeUroborosMode: (payload) => {
			// Uroboros Mode 제안은 이제 bubble로 표시되므로 여기서는 처리하지 않음
			// (OrchestratorAgent에서 이미 response 명령으로 전송됨)
		},
		workspaceFilesList: (payload) => {
			// This will be handled in InputArea component via useEffect
			// We need to pass this through context or use a different approach
		},
		insertAttachment: (payload) => {
			// This will be handled in MainView component directly
			// We need to pass setAttachments through context
		},
	};
}

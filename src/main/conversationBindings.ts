export interface ConversationOwner { projectId: string; conversationId: string }

export class ConversationBindings {
  private readonly byThread = new Map<string, ConversationOwner>();

  remember(threadId: string, owner: ConversationOwner): void { this.byThread.set(threadId, owner); }
  forget(threadId: string): void { this.byThread.delete(threadId); }
  read(threadId: string): ConversationOwner | undefined { return this.byThread.get(threadId); }
}

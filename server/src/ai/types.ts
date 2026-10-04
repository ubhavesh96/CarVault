import type { ChatBlock, ChatMessage, DocType, ExtractedField, ServiceDraft, Vehicle, VehicleContext } from '../types';

export interface ExtractionInput {
  vehicle: Vehicle;
  /** 'auto' lets the provider classify the document. */
  type: DocType | 'auto';
  fileName: string;
  filePath: string;
  mime: string;
  /** Existing dated odometer readings, so a simulated extraction stays consistent with them. */
  knownReadings?: { date: string; mileage: number }[];
}

export interface Extraction {
  type: DocType;
  summary: string;
  fields: ExtractedField[];
  draft?: ServiceDraft;
  issuedOn?: string;
  expiresOn?: string;
}

export interface ChatReply {
  blocks: ChatBlock[];
  suggestions: string[];
}

/**
 * The single seam between CarVault and any AI backend.
 * Implement this interface to add a provider; nothing else in the app knows which one is active.
 */
export interface AIProvider {
  readonly name: 'mock' | 'claude';
  extractDocument(input: ExtractionInput): Promise<Extraction>;
  chat(ctx: VehicleContext, message: string, history: ChatMessage[]): Promise<ChatReply>;
}

import { GitBranch, MessageCircle, Send, Tag, Users } from "lucide-react";

/** Ícone de cada tipo de bloco, compartilhado pelo passo a passo e pelo mapa. */
export const ICONE = { trigger: MessageCircle, message: Send, invite: Users, tag: Tag, condition: GitBranch } as const;

import { RoutingDecision } from '@torvaix/types';
import { MODELS } from '@torvaix/providers';

const CATEGORIES = {
  coding: ['code', 'react', 'function', 'debug', 'error', 'typescript', 'python', 'bug', 'component', 'algorithm', 'optimization', 'refactor', 'test', 'unit test', 'integration', 'deployment', 'api', 'database', 'sql', 'query', 'schema', 'design pattern', 'architecture'],
  writing: ['write', 'edit', 'essay', 'blog', 'rewrite', 'grammar', 'summary', 'translate', 'creative', 'story', 'article', 'content', 'copy', 'marketing', 'social media', 'email', 'letter', 'report', 'documentation'],
  reasoning: ['math', 'logic', 'calculate', 'why', 'explain', 'how', 'solve', 'theory', 'analysis', 'evaluation', 'assessment', 'comparison', 'problem', 'solution', 'strategy', 'plan', 'decision', 'recommendation'],
  research: ['find', 'search', 'history', 'who', 'what', 'when', 'fact', 'data', 'analyze', 'investigate', 'research', 'study', 'survey', 'experiment', 'observation', 'evidence', 'source', 'reference', 'citation']
};

export function routePrompt(prompt: string): RoutingDecision {
  const words = prompt.toLowerCase().split(/\W+/);
  
  const breakdown: Record<string, number> = {
    coding: 0,
    writing: 0,
    reasoning: 0,
    research: 0
  };

  // Enhanced keyword matching with weights
  words.forEach(word => {
    // Coding tasks with higher weights
    if (['code', 'function', 'debug', 'error', 'python', 'javascript', 'typescript', 'react', 'component', 'api', 'database', 'sql', 'algorithm', 'optimization', 'refactor', 'test', 'unit test', 'integration', 'deployment', 'architecture', 'design pattern', 'class', 'method', 'variable', 'loop', 'conditional', 'object', 'array', 'string', 'number', 'boolean', 'null', 'undefined', 'async', 'await', 'promise', 'callback', 'event', 'listener', 'dom', 'html', 'css', 'json', 'xml', 'yaml', 'markdown', 'git', 'github', 'repository', 'commit', 'branch', 'merge', 'pull request', 'issue', 'project', 'workspace', 'module', 'package', 'import', 'export', 'require', 'from', 'default', 'export default', 'interface', 'type', 'generic', 'generics', 'inheritance', 'polymorphism', 'encapsulation', 'abstraction', 'interface', 'abstract', 'final', 'static', 'instance', 'constructor', 'getter', 'setter', 'property', 'field', 'attribute', 'method', 'function', 'arrow', 'fat arrow', 'spread', 'rest', 'destructuring', 'optional chaining', 'nullish coalescing', 'template literal', 'backtick', 'interpolation', 'tagged template', 'literal type', 'keyof', 'typeof', 'instanceof', 'new', 'this', 'super', 'extends', 'implements', 'readonly', 'readonly property', 'private', 'protected', 'public', 'static method', 'instance method', 'class method', 'static property', 'instance property', 'getter', 'setter', 'computed property', 'property initializer', 'constructor parameter', 'parameter properties', 'access modifier', 'visibility', 'encapsulation', 'information hiding', 'abstraction', 'interface segregation', 'single responsibility', 'open closed', 'dependency inversion', 'solid', 'clean code', 'code quality', 'code review', 'peer review', 'code style', 'linting', 'formatting', 'prettier', 'eslint', 'typescript compiler', 'tsc', 'declaration', 'type definition', 'type alias', 'intersection type', 'union type', 'conditional type', 'mapped type', 'indexed access type', 'utility type', 'generic type', 'type parameter', 'constraint', 'extends type', 'implements type', 'type guard', 'type assertion', 'type casting', 'type narrowing', 'type inference', 'type checking', 'type safety', 'type system', 'type checking', 'type validation', 'type schema', 'zod', 'joi', 'ajv', 'typeorm', 'sequelize', 'mongoose', 'prisma', 'typeorm', 'sequelize', 'mongoose', 'prisma', 'typeorm', 'sequelize', 'mongoose', 'prisma', 'typeorm', 'sequelize', 'mongoose', 'prisma', 'typeorm', 'sequelize', 'mongoose', 'prisma', 'typeorm', 'sequelize', 'mongoose', 'prisma'].includes(word) && breakdown.coding++;
    
    if (['write', 'edit', 'essay', 'blog', 'rewrite', 'grammar', 'summary', 'translate', 'creative', 'story', 'article', 'content', 'copy', 'marketing', 'social media', 'email', 'letter', 'report', 'documentation', 'whitepaper', 'case study', 'testimonial', 'press release', 'announcement', 'update', 'post', 'comment', 'reply', 'response', 'answer', 'question', 'inquiry', 'request', 'proposal', 'presentation', 'speech', 'talk', 'lecture', 'tutorial', 'guide', 'manual', 'instruction', 'how to', 'step by step', 'best practices', 'tips', 'advice', 'recommendation', 'suggestion', 'idea', 'concept', 'vision', 'mission', 'values', 'culture', 'brand', 'identity', 'voice', 'tone', 'style', 'format', 'structure', 'organization', 'flow', 'transition', 'coherence', 'consistency', 'clarity', 'conciseness', 'precision', 'accuracy', 'completeness', 'relevance', 'appropriateness', 'sensitivity', 'respect', 'inclusivity', 'diversity', 'equity', 'inclusion', 'accessibility', 'usability', 'user experience', 'user interface', 'design', 'layout', 'typography', 'color', 'contrast', 'hierarchy', 'alignment', 'spacing', 'padding', 'margin', 'border', 'radius', 'shadow', 'gradient', 'animation', 'transition', 'interaction', 'feedback', 'response', 'action', 'command', 'control', 'input', 'output', 'display', 'presentation', 'visualization', 'chart', 'graph', 'diagram', 'flowchart', 'wireframe', 'mockup', 'prototype', 'mock', 'stencil', 'template', 'component', 'widget', 'element', 'atom', 'molecule', 'organism', 'page', 'screen', 'view', 'dialog', 'modal', 'popup', 'overlay', 'tooltip', 'popover', 'dropdown', 'select', 'checkbox', 'radio', 'toggle', 'switch', 'slider', 'range', 'input', 'textarea', 'file', 'upload', 'download', 'save', 'load', 'open', 'close', 'minimize', 'maximize', 'restore', 'resize', 'drag', 'drop', 'drag and drop', 'drop zone', 'file drop', 'file upload', 'image upload', 'video upload', 'audio upload', 'document upload', 'attachment', 'attachment', 'attachment', 'attachment', 'attachment', 'attachment', 'attachment'].includes(word) && breakdown.writing++;
    
    if (['math', 'logic', 'calculate', 'why', 'explain', 'how', 'solve', 'theory', 'analysis', 'evaluation', 'assessment', 'comparison', 'problem', 'solution', 'strategy', 'plan', 'decision', 'recommendation', 'optimization', 'efficiency', 'effectiveness', 'performance', 'quality', 'value', 'benefit', 'cost', 'price', 'budget', 'expense', 'revenue', 'income', 'profit', 'loss', 'risk', 'risk assessment', 'risk management', 'risk mitigation', 'risk transfer', 'risk retention', 'risk sharing', 'risk pooling', 'risk diversification', 'risk hedging', 'risk arbitrage', 'risk premium', 'risk free', 'risk neutral', 'risk averse', 'risk seeking', 'risk neutral', 'risk indifferent', 'risk sensitive', 'risk aware', 'risk conscious', 'risk management', 'risk assessment', 'risk analysis', 'risk evaluation', 'risk measurement', 'risk quantification', 'risk calculation', 'risk estimation', 'risk prediction', 'risk forecasting', 'risk scenario', 'risk simulation', 'risk modeling', 'risk analysis', 'risk assessment', 'risk evaluation', 'risk measurement', 'risk quantification', 'risk calculation', 'risk estimation', 'risk prediction', 'risk forecasting', 'risk scenario', 'risk simulation', 'risk modeling'].includes(word) && breakdown.reasoning++;
    
    if (['find', 'search', 'history', 'who', 'what', 'when', 'fact', 'data', 'analyze', 'investigate', 'research', 'study', 'survey', 'experiment', 'observation', 'evidence', 'source', 'reference', 'citation', 'bibliography', 'reference list', 'works cited', 'footnotes', 'endnotes', 'annotation', 'commentary', 'editorial', 'review', 'critique', 'criticism', 'commentary', 'analysis', 'synthesis', 'synthesis', 'synthesis', 'synthesis', 'synthesis', 'synthesis', 'synthesis', 'synthesis', 'synthesis', 'synthesis'].includes(word) && breakdown.research++;
  });

  // Base confidence
  breakdown.reasoning += 5;

  let maxScore = 0;
  let topCategory = 'reasoning';

  for (const [category, score] of Object.entries(breakdown)) {
    if (score > maxScore) {
      maxScore = score;
      topCategory = category;
    }
  }

  // Normalize to percentage (roughly)
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const confidence = total > 0 ? Math.min(100, Math.round((maxScore / total) * 100)) : 50;

  // Enhanced provider mapping based on category and available models
  let provider = 'openai';
  let reason = 'General reasoning task';

  // Special handling for local models
  if (prompt.toLowerCase().includes('offline') || prompt.toLowerCase().includes('local') || prompt.toLowerCase().includes('privacy')) {
    provider = 'ollama';
    reason = 'Privacy-first local processing';
  }

  switch(topCategory) {
    case 'coding':
      // Choose best coding model
      const codingModel = MODELS.find(m => m.provider === 'deepseek' || m.id.includes('coder')) || MODELS.find(m => m.provider === 'openai');
      provider = codingModel?.provider || 'openai';
      reason = 'Coding & Development Assistance';
      break;
    case 'writing':
      // Choose best writing model
      const writingModel = MODELS.find(m => m.provider === 'anthropic') || MODELS.find(m => m.provider === 'openai');
      provider = writingModel?.provider || 'anthropic';
      reason = 'Creative Writing & Editing';
      break;
    case 'research':
      // Choose best research model
      const researchModel = MODELS.find(m => m.provider === 'google') || MODELS.find(m => m.provider === 'openai');
      provider = researchModel?.provider || 'google';
      reason = 'Research & Data Analysis';
      break;
    case 'reasoning':
      // Choose best reasoning model
      const reasoningModel = MODELS.find(m => m.provider === 'openai') || MODELS.find(m => m.provider === 'anthropic');
      provider = reasoningModel?.provider || 'openai';
      reason = 'Complex Logic & Reasoning';
      break;
  }

  return {
    provider,
    confidence,
    reason,
    breakdown
  };
}

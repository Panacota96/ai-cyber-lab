import { z } from 'zod';

export const graphNodeDataSchema = z.object({
  label: z.string().min(1),
  nodeType: z.string().optional(),
  phase: z.string().optional(),
  color: z.string().optional(),
  sourceEventId: z.string().optional(),
  timestamp: z.string().optional(),
  port: z.string().optional(),
  service: z.string().optional(),
}).passthrough();

export const graphNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('discovery'),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: graphNodeDataSchema,
}).passthrough();

export const graphEdgeStyleSchema = z.object({
  stroke: z.string().optional(),
}).passthrough();

export const graphEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().optional(),
  animated: z.boolean().optional(),
  style: graphEdgeStyleSchema.optional(),
}).passthrough();

export const graphSaveSchema = z.object({
  sessionId: z.string().min(1),
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
});

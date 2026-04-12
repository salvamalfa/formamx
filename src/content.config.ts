import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'zod';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title:       z.string(),
    description: z.string(),
    tags:        z.array(z.string()),
    image:       z.string(),
    liveUrl:     z.string().optional(),
    repoUrl:     z.string().optional(),
    featured:    z.boolean().default(false),
    pubDate:     z.coerce.date(),
  }),
});

const products = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/products' }),
  schema: z.object({
    title:        z.string(),
    description:  z.string(),
    price:        z.string(),
    image:        z.string(),
    category:     z.string(),
    available:    z.boolean().default(true),
    featured:     z.boolean().default(false),
    contactEmail: z.string().optional(),
  }),
});

export const collections = { projects, products };

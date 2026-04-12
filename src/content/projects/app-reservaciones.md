---
title: "App de Reservaciones"
description: "Sistema de reservas para restaurantes con gestión de mesas, notificaciones por email y panel de administración."
tags: ["Astro", "Supabase", "PostgreSQL", "Resend"]
image: "/images/projects/reservaciones.jpg"
repoUrl: "https://github.com/formamx/reservaciones"
featured: false
pubDate: 2024-05-20
---

## Descripción

Aplicación web para gestionar reservaciones en tiempo real. Los clientes reservan desde el sitio público; el restaurante administra todo desde un panel privado.

## Stack

- **Frontend**: Astro con islas interactivas en Preact
- **Base de datos**: Supabase (PostgreSQL + Row Level Security)
- **Emails**: Resend API para confirmaciones automáticas
- **Auth**: Magic links via Supabase Auth

## Características

- Vista de mesas en tiempo real
- Confirmación y recordatorio por email
- Reportes de ocupación por semana/mes
- Bloqueo de fechas especiales

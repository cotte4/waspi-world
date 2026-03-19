import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY ?? '';
export const isResendConfigured = Boolean(apiKey);
export const resend = isResendConfigured ? new Resend(apiKey) : null;

// Template para compra de producto físico
export function buildProductConfirmationEmail(input: {
  customerEmail: string;
  customerName: string | null;
  itemName: string;
  size: string;
  totalArs: number;
  orderId: string;
}): { to: string; subject: string; html: string } {
  const name = input.customerName ?? 'jugador';
  return {
    to: input.customerEmail,
    subject: `✅ Pedido confirmado — WASPI WORLD`,
    html: `
      <div style="font-family:monospace;background:#0E0E14;color:#fff;padding:32px;max-width:520px">
        <h1 style="color:#F5C842;font-size:18px;margin-bottom:8px">WASPI WORLD</h1>
        <p style="color:#888;font-size:12px;margin-bottom:24px">Confirmación de pedido</p>
        <p>Hola <strong>${name}</strong>,</p>
        <p>Tu pedido fue confirmado. 🎉</p>
        <table style="width:100%;border-collapse:collapse;margin:24px 0">
          <tr style="border-bottom:1px solid #333">
            <td style="padding:8px 0;color:#aaa">Producto</td>
            <td style="padding:8px 0;text-align:right"><strong>${input.itemName}</strong></td>
          </tr>
          <tr style="border-bottom:1px solid #333">
            <td style="padding:8px 0;color:#aaa">Talle</td>
            <td style="padding:8px 0;text-align:right">${input.size}</td>
          </tr>
          <tr style="border-bottom:1px solid #333">
            <td style="padding:8px 0;color:#aaa">Total</td>
            <td style="padding:8px 0;text-align:right;color:#F5C842"><strong>$${input.totalArs.toLocaleString('es-AR')} ARS</strong></td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#aaa">N° Pedido</td>
            <td style="padding:8px 0;text-align:right;font-size:11px;color:#666">${input.orderId}</td>
          </tr>
        </table>
        <p style="color:#aaa;font-size:12px">Entrega estimada: 3-5 días hábiles en Argentina.</p>
        <p style="color:#aaa;font-size:12px">Tu prenda ya está en tu inventario del juego — podés equiparla ahora.</p>
        <hr style="border-color:#333;margin:24px 0">
        <p style="color:#555;font-size:11px">WASPI WORLD · waspiworld.com</p>
      </div>
    `,
  };
}

// Template para compra de TENKS pack
export function buildTenksConfirmationEmail(input: {
  customerEmail: string;
  customerName: string | null;
  packName: string;
  tenks: number;
  totalArs: number;
}): { to: string; subject: string; html: string } {
  const name = input.customerName ?? 'jugador';
  return {
    to: input.customerEmail,
    subject: `✅ TENKS acreditados — WASPI WORLD`,
    html: `
      <div style="font-family:monospace;background:#0E0E14;color:#fff;padding:32px;max-width:520px">
        <h1 style="color:#F5C842;font-size:18px;margin-bottom:8px">WASPI WORLD</h1>
        <p style="color:#888;font-size:12px;margin-bottom:24px">Confirmación de compra</p>
        <p>Hola <strong>${name}</strong>,</p>
        <p>Tu compra de TENKS fue procesada. 🪙</p>
        <table style="width:100%;border-collapse:collapse;margin:24px 0">
          <tr style="border-bottom:1px solid #333">
            <td style="padding:8px 0;color:#aaa">Pack</td>
            <td style="padding:8px 0;text-align:right"><strong>${input.packName}</strong></td>
          </tr>
          <tr style="border-bottom:1px solid #333">
            <td style="padding:8px 0;color:#aaa">TENKS acreditados</td>
            <td style="padding:8px 0;text-align:right;color:#F5C842"><strong>${input.tenks.toLocaleString('es-AR')} T</strong></td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#aaa">Total</td>
            <td style="padding:8px 0;text-align:right">$${input.totalArs.toLocaleString('es-AR')} ARS</td>
          </tr>
        </table>
        <p style="color:#aaa;font-size:12px">Los TENKS ya están disponibles en tu cuenta. Entrá al juego y gastálos.</p>
        <hr style="border-color:#333;margin:24px 0">
        <p style="color:#555;font-size:11px">WASPI WORLD · waspiworld.com</p>
      </div>
    `,
  };
}

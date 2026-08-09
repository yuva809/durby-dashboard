"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

export type InvoiceReviewStatus = "PENDING_REVIEW" | "EXTRACTION_FAILED" | "CONFIRMED";

export interface InvoiceListItemDto {
  id: string;
  supplierId: string;
  supplier: { name: string };
  amount: string;
  issuedAt: string;
  reviewStatus: InvoiceReviewStatus;
  sourceFile: string | null;
  _count: { lines: number };
}

export interface InvoiceLineDto {
  id: string;
  invoiceId: string;
  productId: string | null;
  product: { id: string; name: string; unit: string } | null;
  rawProductName: string;
  quantity: string;
  unitPrice: string;
  vatRate: string;
  lineTotal: string;
  confidence: number | null;
  purchaseUnitId: string | null;
}

export interface InvoiceDetailDto extends InvoiceListItemDto {
  subtotal: string | null;
  vatAmount: string | null;
  lines: InvoiceLineDto[];
}

function invalidateInvoices(qc: ReturnType<typeof useQueryClient>, restaurantId: string | null) {
  qc.invalidateQueries({ queryKey: ["invoices", restaurantId] });
  qc.invalidateQueries({ queryKey: ["invoice", restaurantId] });
  qc.invalidateQueries({ queryKey: ["inventory-overview", restaurantId] });
  qc.invalidateQueries({ queryKey: ["inventory-items", restaurantId] });
}

export function useInvoices(reviewStatus?: InvoiceReviewStatus) {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["invoices", restaurantId, reviewStatus ?? "all"],
    queryFn: () =>
      apiClient.get<InvoiceListItemDto[]>(
        `/restaurants/${restaurantId}/invoices${reviewStatus ? `?reviewStatus=${reviewStatus}` : ""}`,
      ),
    enabled: !!restaurantId,
    staleTime: 30_000,
  });
}

export function useInvoiceDetail(invoiceId: string | null) {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["invoice", restaurantId, invoiceId],
    queryFn: () => apiClient.get<InvoiceDetailDto>(`/restaurants/${restaurantId}/invoices/${invoiceId}`),
    enabled: !!restaurantId && !!invoiceId,
    staleTime: 15_000,
  });
}

export function useUploadInvoice() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiClient.post<InvoiceDetailDto>(`/restaurants/${restaurantId}/invoices/upload`, formData);
    },
    onSuccess: () => invalidateInvoices(qc, restaurantId),
  });
}

export function useUpdateInvoiceLine() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      invoiceId, lineId, dto,
    }: {
      invoiceId: string;
      lineId: string;
      dto: { productId?: string | null; quantity?: number; unitPrice?: number; vatRate?: number; rawProductName?: string };
    }) => apiClient.patch(`/restaurants/${restaurantId}/invoices/${invoiceId}/lines/${lineId}`, dto),
    onSuccess: () => invalidateInvoices(qc, restaurantId),
  });
}

export function useUpdateInvoiceHeader() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, dto }: { invoiceId: string; dto: { supplierId?: string; issuedAt?: string } }) =>
      apiClient.patch(`/restaurants/${restaurantId}/invoices/${invoiceId}`, dto),
    onSuccess: () => invalidateInvoices(qc, restaurantId),
  });
}

export function useConfirmInvoice() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) => apiClient.post(`/restaurants/${restaurantId}/invoices/${invoiceId}/confirm`),
    onSuccess: () => invalidateInvoices(qc, restaurantId),
  });
}

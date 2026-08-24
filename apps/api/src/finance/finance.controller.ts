import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { FinanceService } from "./finance.service";
import { renderFinancePdf } from "./finance.pdf";
import { Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";

// Finance exports carry money + personal data — admin only, like reports.
@Controller("finance")
@UseGuards(RolesGuard)
@Roles("admin")
export class FinanceController {
  constructor(private finance: FinanceService) {}

  @Get("summary")
  summary(@Query("from") from?: string, @Query("to") to?: string) {
    return this.finance.summary(from, to);
  }

  // Xero's sales-invoice import template — Business → Invoices → Import in
  // Xero, choosing "Tax Inclusive" (fees are consumer prices).
  @Get("xero.csv")
  async xeroCsv(@Res() res: Response, @Query("from") from?: string, @Query("to") to?: string) {
    const { filename, csv } = await this.finance.xeroSalesCsv(from, to);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get("report.pdf")
  async reportPdf(@Res() res: Response, @Query("from") from?: string, @Query("to") to?: string) {
    const data = await this.finance.summary(from, to);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="financial-report-${data.range.from}-to-${data.range.to}.pdf"`,
    );
    renderFinancePdf(data).pipe(res);
  }
}

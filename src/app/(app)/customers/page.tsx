"use client";

import { useState, useEffect, useCallback } from "react";
import { Customer } from "@/lib/types";
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "@/lib/db";

const emptyCustomer = {
  name: "",
  company: "",
  address: "",
  city: "",
  zip: "",
  country: "Oesterreich",
  uid_number: "",
  leitweg_id: "",
  email: "",
  phone: "",
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyCustomer);
  const [loading, setLoading] = useState(true);

  const loadCustomers = useCallback(async () => {
    const data = await getCustomers();
    setCustomers(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  async function handleSave() {
    if (editing) {
      await updateCustomer(editing, form);
    } else {
      await createCustomer(form);
    }
    await loadCustomers();
    setForm(emptyCustomer);
    setEditing(null);
    setShowForm(false);
  }

  function handleEdit(customer: Customer) {
    setForm({
      name: customer.name,
      company: customer.company,
      address: customer.address,
      city: customer.city,
      zip: customer.zip,
      country: customer.country,
      uid_number: customer.uid_number,
      leitweg_id: customer.leitweg_id || "",
      email: customer.email,
      phone: customer.phone,
    });
    setEditing(customer.id);
    setShowForm(true);
  }

  async function handleDelete(id: string) {
    if (confirm("Kunde wirklich löschen?")) {
      await deleteCustomer(id);
      await loadCustomers();
    }
  }

  const fields: { key: keyof typeof emptyCustomer; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "company", label: "Firma" },
    { key: "address", label: "Adresse" },
    { key: "zip", label: "PLZ" },
    { key: "city", label: "Ort" },
    { key: "country", label: "Land" },
    { key: "uid_number", label: "UID-Nummer" },
    { key: "leitweg_id", label: "Leitweg-ID (XRechnung)" },
    { key: "email", label: "E-Mail" },
    { key: "phone", label: "Telefon" },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-gray-500">Laden...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Kunden</h1>
        <button
          onClick={() => {
            setForm(emptyCustomer);
            setEditing(null);
            setShowForm(true);
          }}
          className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition"
        >
          + Neuer Kunde
        </button>
      </div>

      {showForm && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 mb-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            {editing ? "Kunde bearbeiten" : "Neuer Kunde"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  {f.label}
                </label>
                <input
                  type="text"
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSave}
              className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition"
            >
              Speichern
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
              className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--border)]">
          <thead className="bg-[var(--background)]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Firma / Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Adresse
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                UID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Kontakt
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Aktionen
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  Noch keine Kunden angelegt.
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-[var(--surface-hover)] transition cursor-pointer" onClick={(e) => { if ((e.target as HTMLElement).closest('button, a, input, select')) return; window.location.href = `/customers/${c.id}`; }}>
                <td className="px-6 py-4">
                  <div className="font-medium text-[var(--text-primary)]">
                    {c.company || c.name}
                  </div>
                  {c.company && (
                    <div className="text-sm text-gray-500">{c.name}</div>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-400">
                  {c.address}, {c.zip} {c.city}
                </td>
                <td className="px-6 py-4 text-sm text-gray-400">
                  {c.uid_number}
                </td>
                <td className="px-6 py-4 text-sm text-gray-400">
                  {c.email}
                  {c.phone && <div>{c.phone}</div>}
                </td>
                <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleEdit(c)}
                    className="text-sm text-[var(--accent)] hover:brightness-110 mr-3"
                  >
                    Bearbeiten
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="text-sm text-rose-400 hover:text-rose-300"
                  >
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

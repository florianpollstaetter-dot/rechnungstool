/**
 * Embeds ZUGFeRD CII-XML into an existing PDF, producing a PDF/A-3 compliant
 * hybrid e-invoice. Uses pdf-lib for PDF manipulation.
 */
import { PDFDocument, PDFName, PDFString, PDFArray, PDFDict, PDFHexString, PDFStream } from "pdf-lib";

const FACTURX_FILENAME = "factur-x.xml";
const ZUGFERD_RELATIONSHIP = "Alternative";
const FACTURX_DESCRIPTION = "Factur-X XML invoice data";

/**
 * Takes a regular PDF (as Uint8Array) and a CII-XML string,
 * returns a new PDF with the XML embedded as a PDF/A-3 attachment.
 */
export async function embedZugferdXml(
  pdfBytes: Uint8Array,
  xmlString: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const xmlBytes = new TextEncoder().encode(xmlString);

  // Create the file stream for the XML attachment
  const xmlStream = pdfDoc.context.stream(xmlBytes, {
    Type: PDFName.of("EmbeddedFile"),
    Subtype: PDFName.of("text/xml"),
    Params: PDFDict.fromMapWithContext(
      new Map<PDFName, PDFString | PDFHexString>([
        [PDFName.of("Size"), PDFString.of(String(xmlBytes.length))],
      ]),
      pdfDoc.context
    ),
  });
  const xmlStreamRef = pdfDoc.context.register(xmlStream);

  // Create file specification dictionary
  const efDict = pdfDoc.context.obj({
    F: xmlStreamRef,
    UF: xmlStreamRef,
  });

  const fileSpec = pdfDoc.context.obj({
    Type: PDFName.of("Filespec"),
    F: PDFString.of(FACTURX_FILENAME),
    UF: PDFHexString.fromText(FACTURX_FILENAME),
    Desc: PDFString.of(FACTURX_DESCRIPTION),
    AFRelationship: PDFName.of(ZUGFERD_RELATIONSHIP),
    EF: efDict,
  });
  const fileSpecRef = pdfDoc.context.register(fileSpec);

  // Add to the catalog's Names/EmbeddedFiles
  const namesDict = pdfDoc.context.obj({
    Names: [PDFHexString.fromText(FACTURX_FILENAME), fileSpecRef],
  });
  const namesDictRef = pdfDoc.context.register(namesDict);

  const catalog = pdfDoc.catalog;

  // Set Names > EmbeddedFiles
  const catalogNamesDict = pdfDoc.context.obj({
    EmbeddedFiles: namesDictRef,
  });
  const catalogNamesDictRef = pdfDoc.context.register(catalogNamesDict);
  catalog.set(PDFName.of("Names"), catalogNamesDictRef);

  // Set AF (Associated Files) array on catalog
  const afArray = pdfDoc.context.obj([fileSpecRef]);
  catalog.set(PDFName.of("AF"), afArray);

  // Set PDF/A identification (part 3, conformance B)
  setPdfAIdentification(pdfDoc);

  // Set XMP metadata for PDF/A-3 and Factur-X
  await setXmpMetadata(pdfDoc);

  return pdfDoc.save();
}

function setPdfAIdentification(pdfDoc: PDFDocument) {
  // PDF/A identification extension via the catalog's MarkInfo and metadata
  const catalog = pdfDoc.catalog;

  // Mark as tagged PDF (required for PDF/A)
  const markInfo = pdfDoc.context.obj({ Marked: true });
  catalog.set(PDFName.of("MarkInfo"), pdfDoc.context.register(markInfo));
}

async function setXmpMetadata(pdfDoc: PDFDocument) {
  const title = "ZUGFeRD Invoice";
  const now = new Date().toISOString();

  const xmp = `<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
      xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
      xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
      <dc:title>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${title}</rdf:li>
        </rdf:Alt>
      </dc:title>
      <dc:date>
        <rdf:Seq>
          <rdf:li>${now}</rdf:li>
        </rdf:Seq>
      </dc:date>
      <pdf:Producer>Orange Octo Rechnungstool</pdf:Producer>
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>COMFORT</fx:ConformanceLevel>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

  const xmpBytes = new TextEncoder().encode(xmp);
  const metadataStream = pdfDoc.context.stream(xmpBytes, {
    Type: PDFName.of("Metadata"),
    Subtype: PDFName.of("XML"),
    Length: xmpBytes.length,
  });
  const metadataRef = pdfDoc.context.register(metadataStream);
  pdfDoc.catalog.set(PDFName.of("Metadata"), metadataRef);
}

const nodemailer = require('nodemailer');

module.exports = async function (context, req) {
    context.log('Rental application function triggered');

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        context.res = {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Max-Age': '86400'
            },
            body: ''
        };
        return;
    }

    // Set CORS headers for actual requests
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
    };

    try {
        // Validate request method
        if (req.method !== 'POST') {
            context.res = {
                status: 405,
                headers: corsHeaders,
                body: { error: 'Method not allowed' }
            };
            return;
        }

        // Validate request body
        if (!req.body) {
            context.res = {
                status: 400,
                headers: corsHeaders,
                body: { error: 'Request body is required' }
            };
            return;
        }

        const formData = req.body;
        context.log('Processing application for:', formData.applicant_email);

        // Validate required fields
        const requiredFields = ['applicant_name', 'applicant_firstname', 'applicant_email', 'monthly_income'];
        const missingFields = requiredFields.filter(field => !formData[field]);
        
        if (missingFields.length > 0) {
            context.res = {
                status: 400,
                headers: corsHeaders,
                body: { 
                    error: 'Missing required fields', 
                    missingFields: missingFields 
                }
            };
            return;
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.applicant_email)) {
            context.res = {
                status: 400,
                headers: corsHeaders,
                body: { error: 'Invalid email format' }
            };
            return;
        }

        // Configure email transporter
        const transporter = nodemailer.createTransporter({
            service: 'hotmail', // Use 'hotmail' for Outlook.com
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            tls: {
                ciphers: 'SSLv3'
            }
        });

        // Verify transporter configuration
        try {
            await transporter.verify();
            context.log('Email transporter verified successfully');
        } catch (error) {
            context.log.error('Email transporter verification failed:', error);
            throw new Error('Email configuration error');
        }

        // Format application data
        const emailContentText = formatEmailContent(formData);
        const emailContentHtml = formatEmailHTML(formData);

        // Send email to property owner
        const ownerEmailOptions = {
            from: process.env.EMAIL_USER,
            to: 'nguyenanhthang@outlook.de',
            subject: `🏠 New Rental Application - ${formData.applicant_firstname} ${formData.applicant_name}`,
            text: emailContentText,
            html: emailContentHtml
        };

        await transporter.sendMail(ownerEmailOptions);
        context.log('Owner notification email sent successfully');

        // Send confirmation email to applicant
        const applicantEmailOptions = {
            from: process.env.EMAIL_USER,
            to: formData.applicant_email,
            subject: 'Rental Application Received - Braunschweig Apartment / Mietbewerbung erhalten',
            text: formatConfirmationText(formData),
            html: formatConfirmationHTML(formData)
        };

        await transporter.sendMail(applicantEmailOptions);
        context.log('Applicant confirmation email sent successfully');

        // Log application for monitoring
        context.log('Application processed:', {
            applicant: `${formData.applicant_firstname} ${formData.applicant_name}`,
            email: formData.applicant_email,
            income: formData.monthly_income,
            moveInDate: formData.moveInDate,
            timestamp: new Date().toISOString()
        });

        // Send success response
        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                success: true,
                message: 'Application submitted successfully',
                applicantEmail: formData.applicant_email,
                timestamp: new Date().toISOString()
            }
        };

    } catch (error) {
        context.log.error('Error processing rental application:', error);
        
        // Send error response
        context.res = {
            status: 500,
            headers: corsHeaders,
            body: {
                success: false,
                error: 'Internal server error',
                message: 'Unable to process application. Please try again later.',
                timestamp: new Date().toISOString()
            }
        };
    }
};

// Format detailed email content for property owner
function formatEmailContent(data) {
    const timestamp = new Date().toLocaleString('de-DE', { 
        timeZone: 'Europe/Berlin',
        dateStyle: 'full',
        timeStyle: 'short'
    });

    let content = `🏠 NEW RENTAL APPLICATION - BRAUNSCHWEIG APARTMENT\n`;
    content += `${'='.repeat(60)}\n\n`;
    
    content += `📍 PROPERTY DETAILS:\n`;
    content += `Address: Building 24DE, Celler Str., 38114 Braunschweig\n`;
    content += `Size: 60m² apartment with balcony, 2 rooms, 1 kitchen, 1 toilet\n`;
    content += `Rent: Kaltmiete 720€, Warmmiete 850€\n`;
    content += `Deposit Required: 2,160€ (3 months Kaltmiete)\n`;
    content += `Submission Date: ${timestamp}\n\n`;
    
    content += `👤 APPLICANT INFORMATION:\n`;
    content += `Name: ${data.applicant_firstname || ''} ${data.applicant_name || ''}\n`;
    content += `Date of Birth: ${data.applicant_dob || 'Not provided'}\n`;
    content += `Nationality: ${data.applicant_nationality || 'Not provided'}\n`;
    content += `Email: ${data.applicant_email || ''}\n`;
    content += `Mobile: ${data.applicant_mobile || ''}\n`;
    if (data.applicant_phone) content += `Phone: ${data.applicant_phone}\n`;
    content += `Marital Status: ${data.applicant_marital || 'Not specified'}\n`;
    content += `Current Address: ${data.applicant_address || 'Not provided'}\n\n`;
    
    content += `💼 EMPLOYMENT & INCOME:\n`;
    content += `Employer: ${data.employer || 'Not provided'}\n`;
    content += `Job Title: ${data.job_title || 'Not provided'}\n`;
    content += `Employed Since: ${data.employment_since || 'Not provided'}\n`;
    if (data.self_employed) content += `Self-employed as: ${data.self_employed}\n`;
    content += `Monthly Net Income: €${data.monthly_income || '0'}\n`;
    
    if (data.ukrainian_aid_amount) {
        content += `Ukrainian State Aid: €${data.ukrainian_aid_amount}/month\n`;
        content += `Aid Documentation: ${data.ukrainian_aid_proof === 'yes' ? 'Available' : 'Not available'}\n`;
    }
    content += `\n`;
    
    content += `🏠 RENTAL PREFERENCES:\n`;
    content += `Desired Move-in Date: ${data.moveInDate || 'Flexible'}\n`;
    content += `Number of Occupants: ${data.moving_persons || 'Not specified'}\n`;
    content += `Pets: ${data.pets || 'None specified'}\n`;
    content += `Deposit Payment Ability: €${data.deposit_ability || 'Not specified'}\n`;
    
    if (data.current_tenancy_since) content += `Current Tenancy Since: ${data.current_tenancy_since}\n`;
    if (data.termination_by) {
        const terminationLabels = {
            'tenant': 'Terminated by Tenant',
            'landlord': 'Terminated by Landlord', 
            'not_terminated': 'Not Terminated'
        };
        content += `Termination Status: ${terminationLabels[data.termination_by] || data.termination_by}\n`;
    }
    if (data.termination_reason) content += `Termination Reason: ${data.termination_reason}\n`;
    content += `\n`;
    
    // Add household members
    let householdMembers = [];
    for (let i = 1; i <= 5; i++) {
        if (data[`household_name_${i}`] || data[`household_firstname_${i}`]) {
            const member = {
                name: `${data[`household_firstname_${i}`] || ''} ${data[`household_name_${i}`] || ''}`.trim(),
                relation: data[`household_relation_${i}`] || '',
                dob: data[`household_dob_${i}`] || '',
                income: data[`household_income_${i}`] || '0'
            };
            householdMembers.push(`${member.name} (${member.relation}, DOB: ${member.dob}, Income: €${member.income})`);
        }
    }
    
    if (householdMembers.length > 0) {
        content += `👨‍👩‍👧‍👦 HOUSEHOLD MEMBERS:\n`;
        householdMembers.forEach((member, index) => {
            content += `${index + 1}. ${member}\n`;
        });
        content += `\n`;
    }
    
    // Add required documents
    const selectedDocs = Array.isArray(data.documents) ? data.documents : (data.documents ? [data.documents] : []);
    if (selectedDocs.length > 0) {
        content += `📄 DOCUMENTS TO BE PROVIDED:\n`;
        const docLabels = {
            'debt_free_certificate': '✓ Rental Debt-Free Certificate',
            'schufa_report': '✓ SCHUFA Credit Report',
            'income_proof': '✓ Income Verification (Last 3 Salary Statements)',
            'ukrainian_aid_proof': '✓ Ukrainian State Aid Documentation',
            'id_copy': '✓ Copy of Identity Document',
            'employment_contract': '✓ Employment Contract',
            'bank_statements': '✓ Bank Statements (Last 3 Months)'
        };
        selectedDocs.forEach(doc => {
            content += `${docLabels[doc] || `✓ ${doc}`}\n`;
        });
        content += `\n`;
    }
    
    content += `📞 CONTACT FOR VIEWING:\n`;
    content += `Email: ${data.applicant_email || ''}\n`;
    content += `Phone: ${data.applicant_mobile || ''}\n\n`;
    
    content += `💡 NEXT STEPS:\n`;
    content += `1. Review application details above\n`;
    content += `2. Contact applicant to schedule viewing\n`;
    content += `3. Request specified documents\n`;
    content += `4. Proceed with tenant screening if interested\n\n`;
    
    content += `Full application data is available in JSON format upon request.\n`;
    content += `This is an automated message from your rental application system.`;
    
    return content;
}

// Format HTML email for property owner
function formatEmailHTML(data) {
    const timestamp = new Date().toLocaleString('de-DE', { 
        timeZone: 'Europe/Berlin',
        dateStyle: 'full',
        timeStyle: 'short'
    });

    return `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h1 style="margin: 0; font-size: 24px;">🏠 New Rental Application</h1>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">Braunschweig Apartment - Building 24DE</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                <h3 style="color: #333; margin-top: 0;">📍 Property Details</h3>
                <p><strong>Address:</strong> Building 24DE, Celler Str., 38114 Braunschweig</p>
                <p><strong>Size:</strong> 60m² apartment with balcony, 2 rooms, 1 kitchen, 1 toilet</p>
                <p><strong>Rent:</strong> Kaltmiete 720€, Warmmiete 850€</p>
                <p><strong>Deposit Required:</strong> 2,160€ (3 months Kaltmiete)</p>
                <p><strong>Submission Date:</strong> ${timestamp}</p>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                <div style="background: white; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">
                    <h3 style="color: #333; margin-top: 0;">👤 Applicant Information</h3>
                    <p><strong>Name:</strong> ${data.applicant_firstname || ''} ${data.applicant_name || ''}</p>
                    <p><strong>Date of Birth:</strong> ${data.applicant_dob || 'Not provided'}</p>
                    <p><strong>Nationality:</strong> ${data.applicant_nationality || 'Not provided'}</p>
                    <p><strong>Email:</strong> <a href="mailto:${data.applicant_email}">${data.applicant_email || ''}</a></p>
                    <p><strong>Mobile:</strong> <a href="tel:${data.applicant_mobile}">${data.applicant_mobile || ''}</a></p>
                    ${data.applicant_phone ? `<p><strong>Phone:</strong> <a href="tel:${data.applicant_phone}">${data.applicant_phone}</a></p>` : ''}
                    <p><strong>Marital Status:</strong> ${data.applicant_marital || 'Not specified'}</p>
                </div>

                <div style="background: white; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">
                    <h3 style="color: #333; margin-top: 0;">💼 Employment & Income</h3>
                    <p><strong>Employer:</strong> ${data.employer || 'Not provided'}</p>
                    <p><strong>Job Title:</strong> ${data.job_title || 'Not provided'}</p>
                    <p><strong>Employed Since:</strong> ${data.employment_since || 'Not provided'}</p>
                    ${data.self_employed ? `<p><strong>Self-employed as:</strong> ${data.self_employed}</p>` : ''}
                    <p><strong>Monthly Net Income:</strong> <span style="color: #28a745; font-weight: bold;">€${data.monthly_income || '0'}</span></p>
                    ${data.ukrainian_aid_amount ? `
                        <p><strong>Ukrainian Aid:</strong> €${data.ukrainian_aid_amount}/month</p>
                        <p><strong>Aid Documentation:</strong> ${data.ukrainian_aid_proof === 'yes' ? '✅ Available' : '❌ Not available'}</p>
                    ` : ''}
                </div>
            </div>

            <div style="background: white; padding: 15px; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 20px;">
                <h3 style="color: #333; margin-top: 0;">🏠 Rental Preferences</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <p><strong>Move-in Date:</strong> ${data.moveInDate || 'Flexible'}</p>
                    <p><strong>Number of Occupants:</strong> ${data.moving_persons || 'Not specified'}</p>
                    <p><strong>Pets:</strong> ${data.pets || 'None specified'}</p>
                    <p><strong>Deposit Ability:</strong> €${data.deposit_ability || 'Not specified'}</p>
                </div>
                ${data.current_tenancy_since ? `<p><strong>Current Tenancy Since:</strong> ${data.current_tenancy_since}</p>` : ''}
                ${data.termination_by ? `<p><strong>Termination Status:</strong> ${data.termination_by}</p>` : ''}
                ${data.termination_reason ? `<p><strong>Termination Reason:</strong> ${data.termination_reason}</p>` : ''}
            </div>

            <div style="background: #e3f2fd; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                <h3 style="color: #1565c0; margin-top: 0;">📞 Quick Contact</h3>
                <p style="margin-bottom: 10px;">Ready to schedule a viewing?</p>
                <a href="mailto:${data.applicant_email}?subject=Rental Application - Braunschweig Apartment Viewing" 
                   style="background: #1976d2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-right: 10px;">
                   📧 Send Email
                </a>
                <a href="tel:${data.applicant_mobile}" 
                   style="background: #388e3c; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                   📱 Call Now
                </a>
            </div>

            <div style="font-size: 12px; color: #666; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
                <p>This is an automated message from your rental application system.</p>
                <p>Application received on ${timestamp}</p>
            </div>
        </div>
    `;
}

// Format confirmation email text for applicant
function formatConfirmationText(data) {
    return `Dear ${data.applicant_firstname},

Thank you for your rental application for the apartment at Building 24DE, Celler Str., 38114 Braunschweig.

APPLICATION DETAILS:
- Property: 60m² apartment with balcony
- Rent: Kaltmiete 720€, Warmmiete 850€ 
- Deposit: 2,160€
- Your desired move-in date: ${data.moveInDate || 'Not specified'}

We have successfully received your application and will review it carefully. You can expect to hear from us within 2-3 business days.

NEXT STEPS:
1. We will review your application
2. If suitable, we will contact you to schedule a viewing
3. Please prepare the documents you indicated you can provide
4. We may request additional information if needed

If you have any questions, please feel free to contact us.

Best regards,
Property Management
nguyenanhthang@outlook.de

---

Liebe/r ${data.applicant_firstname},

vielen Dank für Ihre Mietbewerbung für die Wohnung in Building 24DE, Celler Str., 38114 Braunschweig.

BEWERBUNGSDETAILS:
- Objekt: 60m² Wohnung mit Balkon
- Miete: Kaltmiete 720€, Warmmiete 850€
- Kaution: 2.160€
- Ihr gewünschter Einzugstermin: ${data.moveInDate || 'Nicht angegeben'}

Wir haben Ihre Bewerbung erfolgreich erhalten und werden sie sorgfältig prüfen. Sie können innerhalb von 2-3 Werktagen mit einer Rückmeldung von uns rechnen.

NÄCHSTE SCHRITTE:
1. Wir prüfen Ihre Bewerbung
2. Bei Eignung kontaktieren wir Sie für einen Besichtigungstermin
3. Bitte halten Sie die angegebenen Unterlagen bereit
4. Ggf. fordern wir zusätzliche Informationen an

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen,
Immobilienverwaltung
nguyenanhthang@outlook.de`;
}

// Format confirmation email HTML for applicant  
function formatConfirmationHTML(data) {
    return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
                <h1 style="margin: 0; font-size: 24px;">✅ Application Received</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Bewerbung erhalten</p>
            </div>
            
            <p>Dear ${data.applicant_firstname}, / Liebe/r ${data.applicant_firstname},</p>
            
            <p><strong>Thank you for your rental application!</strong><br>
            <em>Vielen Dank für Ihre Mietbewerbung!</em></p>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0;">🏠 Property Details / Objektdetails</h3>
                <p><strong>Address / Adresse:</strong> Building 24DE, Celler Str., 38114 Braunschweig</p>
                <p><strong>Size / Größe:</strong> 60m² apartment with balcony / Wohnung mit Balkon</p>
                <p><strong>Rent / Miete:</strong> Kaltmiete 720€, Warmmiete 850€</p>
                <p><strong>Deposit / Kaution:</strong> 2,160€</p>
                <p><strong>Your move-in date / Ihr Einzugstermin:</strong> ${data.moveInDate || 'Not specified / Nicht angegeben'}</p>
            </div>
            
            <div style="background: #e8f5e8; padding: 15px; border-radius: 5px; border-left: 4px solid #4CAF50; margin: 20px 0;">
                <h3 style="color: #2e7d32; margin-top: 0;">✅ Next Steps / Nächste Schritte</h3>
                <ol style="margin: 0; padding-left: 20px;">
                    <li><strong>Review:</strong> We will review your application / Wir prüfen Ihre Bewerbung</li>
                    <li><strong>Contact:</strong> If suitable, we'll schedule a viewing / Bei Eignung vereinbaren wir einen Besichtigungstermin</li>
                    <li><strong>Documents:</strong> Please prepare your documents / Bitte halten Sie Ihre Unterlagen bereit</li>
                    <li><strong>Response:</strong> Expect our response in 2-3 business days / Antwort in 2-3 Werktagen</li>
                </ol>
            </div>
            
            <div style="background: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107; margin: 20px 0;">
                <p style="margin: 0;"><strong>📄 Documents to prepare / Unterlagen vorbereiten:</strong></p>
                <p style="margin: 5px 0 0 0; font-size: 14px;">Please have ready the documents you indicated in your application.<br>
                <em>Bitte halten Sie die in Ihrer Bewerbung angegebenen Unterlagen bereit.</em></p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
                <p style="color: #666;">Questions? Contact us / Fragen? Kontaktieren Sie uns:</p>
                <a href="mailto:nguyenanhthang@outlook.de" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                    📧 nguyenanhthang@outlook.de
                </a>
            </div>
            
            <div style="font-size: 12px; color: #666; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
                <p>This is an automated confirmation.<br>
                <em>Dies ist eine automatische Bestätigung.</em></p>
                <p>Application received on ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}</p>
            </div>
        </div>
    `;
}
